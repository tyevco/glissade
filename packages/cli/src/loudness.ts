/**
 * gs measure-loudness (0.12, DESIGN §5.3): loudness-normalized PUBLISH profiles
 * via a deterministic, peak-clamped scalar GAIN — NOT a render-pipeline change.
 *
 * The key insight: YouTube/Shorts re-normalize loudness platform-side, so the
 * publish target is *≤ target-LUFS AND ≤ -1 dBTP*, not exact. So we never need a
 * two-pass limiter on the render hot path. Instead:
 *
 *   1. `gs measure-loudness` runs ffmpeg's `loudnorm` measurement pass (a
 *      print-only ebur128 + true-peak gate) at MEASURE-time over the final
 *      mixed PCM, reading `inputI` (integrated LUFS), `inputTp` (true peak
 *      dBTP), `inputLra`. This is the ONE non-deterministic stage and it is
 *      QUARANTINED to commit-time — §5.3 already concedes mix-to-PCM bytes are
 *      per-path only.
 *   2. It commits a `<scene>.loudness.json` carrying the measured numbers, the
 *      chosen profile, the resulting `gain` (dB), and a `mixHash` binding the
 *      measurement to the mix CONTENT (the narration/music/sfx manifests).
 *   3. `gs render` reads that file and applies `gain` as a PURE scalar
 *      `volume=<gain>dB` multiply on the FINAL mix node — a single scalar in the
 *      existing filter graph, NOT a new ffmpeg pass. That stage is bit-exact and
 *      golden-hashable (a multiply at the same float→Int16 boundary the rest of
 *      the audio path shares).
 *
 * The gain is peak-clamped: `gain = min(gainForTargetLUFS, (-1 dBTP) - inputTp)`.
 * The clamp uses the MEASURED true-peak, so the published output is guaranteed
 * ≤ -1 dBTP with no render-time oversampling. (For 0.12 the brickwall true-peak
 * LIMITER is DEFERRED — un-normalized profiles still get the gain plus an
 * advisory warning when a peaky source would have needed brickwalling.)
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class LoudnessError extends Error {
  constructor(detail: string) {
    super(`loudness: ${detail}`);
    this.name = 'LoudnessError';
  }
}

// ---- publish profiles ----

/** A publish target: integrated-loudness goal + the true-peak ceiling. */
export interface PublishProfile {
  readonly id: string;
  /** integrated-loudness target, LUFS */
  readonly targetLufs: number;
  /** true-peak ceiling, dBTP (the peak clamp is computed against this) */
  readonly truePeakDb: number;
  /**
   * Whether the platform re-normalizes loudness on its side. For
   * platform-normalized targets (YouTube/Shorts) a peaky source that can't reach
   * `targetLufs` without clipping is fine — the platform finishes the job. For
   * un-normalized targets (podcast/broadcast) it earns an advisory warning,
   * since 0.12 ships no brickwall limiter to recover the headroom.
   */
  readonly platformNormalized: boolean;
}

export const PUBLISH_PROFILES: Readonly<Record<string, PublishProfile>> = Object.freeze({
  // YouTube and Shorts both normalize to roughly -14 LUFS with a -1 dBTP ceiling.
  youtube: { id: 'youtube', targetLufs: -14, truePeakDb: -1, platformNormalized: true },
  shorts: { id: 'shorts', targetLufs: -14, truePeakDb: -1, platformNormalized: true },
  // Spoken-word / podcast target (Apple/Spotify spoken).
  podcast: { id: 'podcast', targetLufs: -16, truePeakDb: -1, platformNormalized: false },
  // EBU R128 broadcast.
  broadcast: { id: 'broadcast', targetLufs: -23, truePeakDb: -1, platformNormalized: false },
  ebu: { id: 'ebu', targetLufs: -23, truePeakDb: -1, platformNormalized: false },
});

export const DEFAULT_PROFILE_ID = 'youtube';

/** Resolve a profile id (case-insensitive) or throw with the valid set. */
export function resolveProfile(id: string): PublishProfile {
  const key = id.trim().toLowerCase();
  const p = PUBLISH_PROFILES[key];
  if (!p) {
    throw new LoudnessError(`unknown publish profile '${id}' (have: ${Object.keys(PUBLISH_PROFILES).join(', ')})`);
  }
  return p;
}

// ---- the committed measurement schema ----

export const LOUDNESS_SCHEMA_VERSION = 1 as const;

/** The committed `<scene>.loudness.json`. */
export interface LoudnessMeasurement {
  loudnessVersion: typeof LOUDNESS_SCHEMA_VERSION;
  /** the resolved publish profile id (youtube/shorts/podcast/broadcast/ebu) */
  profileId: string;
  /** measured integrated loudness, LUFS (ebur128) */
  inputI: number;
  /** measured true peak, dBTP */
  inputTp: number;
  /** measured loudness range, LU */
  inputLra: number;
  /**
   * the deterministic gain to apply at render, in dB.
   * `gain = min(targetLufs - inputI, truePeakDb - inputTp)` — the peak clamp
   * guarantees the published output is ≤ truePeakDb using the MEASURED peak.
   */
  gain: number;
  /**
   * binds this measurement to the mix CONTENT version (a hash of the mix input
   * manifests — narration/music/sfx timing + any wired timeline audio — NOT
   * mtime). Render recomputes it and HARD-THROWS on mismatch so a re-narrate
   * invalidates the measurement loudly instead of silently mis-normalizing.
   */
  mixHash: string;
}

// ---- the gain formula ----

/**
 * The peak-clamped publish gain (dB). `gainForTargetLUFS = target - inputI`
 * raises/lowers to the integrated target; the clamp `truePeak - inputTp` caps it
 * so the result never exceeds the true-peak ceiling. We take the min: a source
 * that can't reach the loudness target without clipping is left below it (the
 * platform re-normalizes the rest for `youtube`/`shorts`).
 */
export function computeGainDb(profile: PublishProfile, inputI: number, inputTp: number): number {
  const gainForTargetLufs = profile.targetLufs - inputI;
  const peakClamp = profile.truePeakDb - inputTp;
  return Math.min(gainForTargetLufs, peakClamp);
}

/**
 * True when the peak clamp BOUND the gain — i.e. the source is too peaky to reach
 * the loudness target without exceeding the true-peak ceiling. For an
 * un-normalized profile this is where a brickwall limiter would normally recover
 * the headroom (deferred in 0.12 → advisory warning).
 */
export function peakClampBinds(profile: PublishProfile, inputI: number, inputTp: number): boolean {
  return profile.truePeakDb - inputTp < profile.targetLufs - inputI;
}

// ---- the mix-content hash (binds measurement to mix inputs) ----

/**
 * Hash the CONTENT of the mix's input manifests so a re-narrate / re-sfx / music
 * change invalidates a committed measurement. We hash the files' BYTES (not
 * mtime): the narration/music/sfx timing manifests and any wired timeline audio
 * sidecars. Missing siblings are recorded by name with a sentinel so adding one
 * later also changes the hash. The scene module path itself is excluded — the
 * mix is a function of the manifests, and timeline `audio` clips flow through the
 * narration/music/sfx manifests or the explicitly-passed extra inputs.
 */
export function computeMixHash(modulePath: string, extraInputs: readonly string[] = []): string {
  const base = modulePath.replace(/\.[jt]sx?$/, '');
  const siblings = [
    `${base}.narration.timing.json`,
    `${base}.music.timing.json`,
    `${base}.sfx.timing.json`,
  ];
  const h = createHash('sha256');
  for (const path of [...siblings, ...extraInputs]) {
    h.update(path);
    h.update('\0');
    if (existsSync(path)) {
      h.update(readFileSync(path));
    } else {
      h.update('\0ABSENT\0');
    }
    h.update('\0');
  }
  return `sha256:${h.digest('hex')}`;
}

// ---- the committed-file path ----

/** `<module>.loudness.json` for a scene module. */
export function loudnessPathFor(modulePath: string): string {
  return modulePath.replace(/\.[jt]sx?$/, '') + '.loudness.json';
}

/** Read + validate a committed measurement, or null when none is committed. */
export function readLoudness(modulePath: string): LoudnessMeasurement | null {
  const path = loudnessPathFor(modulePath);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<LoudnessMeasurement>;
  if (raw.loudnessVersion !== LOUDNESS_SCHEMA_VERSION) {
    throw new LoudnessError(
      `${path}: unsupported loudnessVersion ${String(raw.loudnessVersion)} (expected ${LOUDNESS_SCHEMA_VERSION}); re-run gs measure-loudness`,
    );
  }
  if (
    typeof raw.gain !== 'number' ||
    typeof raw.inputI !== 'number' ||
    typeof raw.inputTp !== 'number' ||
    typeof raw.inputLra !== 'number' ||
    typeof raw.mixHash !== 'string' ||
    typeof raw.profileId !== 'string'
  ) {
    throw new LoudnessError(`${path}: malformed measurement; re-run gs measure-loudness`);
  }
  return raw as LoudnessMeasurement;
}

// ---- the ffmpeg measurement (MEASURE-time only; never on the render path) ----

/**
 * Parse the JSON block ffmpeg's `loudnorm=print_format=json` prints to stderr.
 * It carries `input_i` / `input_tp` / `input_lra` (the measured loudness),
 * alongside the would-be normalization params (which we ignore — we apply our
 * own peak-clamped scalar gain instead).
 */
export function parseLoudnormJson(stderr: string): { inputI: number; inputTp: number; inputLra: number } {
  // the JSON is the LAST {...} block ffmpeg prints
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < 0 || end < start) {
    throw new LoudnessError(`could not find loudnorm JSON in ffmpeg output:\n${stderr.slice(-1000)}`);
  }
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
  } catch {
    throw new LoudnessError(`could not parse loudnorm JSON:\n${stderr.slice(start, end + 1)}`);
  }
  const num = (k: string): number => {
    const v = Number(parsed[k]);
    if (!Number.isFinite(v)) throw new LoudnessError(`loudnorm JSON missing finite '${k}' (got '${parsed[k]}')`);
    return v;
  };
  return { inputI: num('input_i'), inputTp: num('input_tp'), inputLra: num('input_lra') };
}

/**
 * Run ffmpeg's loudnorm measurement pass over a built mix WAV/PCM file and return
 * the measured loudness. This is the quarantined non-deterministic stage — it
 * runs ONLY at measure-time (commit), never during render.
 */
export function measureFile(audioPath: string): { inputI: number; inputTp: number; inputLra: number } {
  const result = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', audioPath, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new LoudnessError(`ffmpeg loudnorm measurement failed (exit ${result.status}):\n${(result.stderr ?? '').slice(-1000)}`);
  }
  return parseLoudnormJson(result.stderr ?? '');
}

// ---- the `gs measure-loudness` command ----

export interface MeasureLoudnessOptions {
  modulePath: string;
  /** publish profile id; default 'youtube' */
  profile?: string;
  /** narration auto-mix toggle (mirrors render); default auto */
  narration?: 'auto' | 'off';
  music?: 'auto' | 'off';
  sfx?: 'auto' | 'off';
}

export interface MeasureLoudnessResult {
  measurement: LoudnessMeasurement;
  loudnessPath: string;
  /** profile the measurement was taken against */
  profile: PublishProfile;
  /** true when the peak clamp bound the gain (advisory: would need a brickwall limiter on an un-normalized profile) */
  clampBound: boolean;
  /** an advisory warning string when an un-normalized profile can't reach its target without clipping; else null */
  warning: string | null;
}

/**
 * Build the final mix to a WAV, run the ffmpeg loudnorm measurement over it, and
 * commit a `<scene>.loudness.json` with the peak-clamped publish gain + a mixHash
 * bound to the mix-input manifests. This is the measure step (commit-time); it is
 * the only place the non-deterministic ebur128/mix-to-PCM stages run.
 */
export async function measureLoudnessCommand(opts: MeasureLoudnessOptions): Promise<MeasureLoudnessResult> {
  const profile = resolveProfile(opts.profile ?? DEFAULT_PROFILE_ID);

  // build the mix exactly as render will (same planFinalAudio), to a WAV
  const { buildMixWav } = await import('./render.js');
  const tmp = mkdtempSync(join(tmpdir(), 'glissade-loudness-'));
  try {
    const wavPath = join(tmp, 'mix.wav');
    const built = await buildMixWav(
      {
        modulePath: opts.modulePath,
        narration: opts.narration ?? 'auto',
        music: opts.music ?? 'auto',
        sfx: opts.sfx ?? 'auto',
      },
      wavPath,
    );
    if (!built) {
      throw new LoudnessError(
        `${opts.modulePath} has no audio to measure (no timeline audio and no narration/music/sfx manifests)`,
      );
    }

    const { inputI, inputTp, inputLra } = measureFile(wavPath);
    const gain = computeGainDb(profile, inputI, inputTp);
    const clampBound = peakClampBinds(profile, inputI, inputTp);
    const mixHash = computeMixHash(opts.modulePath);

    const measurement: LoudnessMeasurement = {
      loudnessVersion: LOUDNESS_SCHEMA_VERSION,
      profileId: profile.id,
      inputI: round2(inputI),
      inputTp: round2(inputTp),
      inputLra: round2(inputLra),
      gain: round2(gain),
      mixHash,
    };

    const loudnessPath = loudnessPathFor(opts.modulePath);
    writeFileSync(loudnessPath, JSON.stringify(measurement, null, 2) + '\n');

    // advisory: a peaky un-normalized target that 0.12's (deferred) brickwall
    // limiter would have recovered — the platform-normalized targets don't care.
    const warning =
      clampBound && !profile.platformNormalized
        ? `profile '${profile.id}' targets ${profile.targetLufs} LUFS but the source true-peak (${measurement.inputTp} dBTP) clamps the gain to ${measurement.gain} dB, leaving the mix at ~${round2(inputI + gain)} LUFS (below target). A brickwall true-peak limiter (deferred in 0.12) would recover the headroom; for now this profile under-shoots loudness.`
        : null;

    return { measurement, loudnessPath, profile, clampBound, warning };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

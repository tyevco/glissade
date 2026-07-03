/**
 * `gs master` (0.39) — SERIES-level loudness: measure every member together, pick
 * the loudest shared LUFS target the whole set can hit under a shared true-peak
 * ceiling, and SHIP the deferred brickwall true-peak limiter so a peaky short
 * recovers headroom instead of landing 2 LU low. Writes a committed
 * `<scene>.loudness.json` per member (the existing sidecar shape + an optional
 * `limiter` block), so it composes with the render-time mixHash preflight and
 * applies as a mix-only remux (never a re-render).
 *
 * This module holds the PURE planning core (no ffmpeg / no I/O): given each
 * member's measured `inputI`/`inputTp`, it computes the shared target + per-member
 * gain + predicted gain-reduction. The ffmpeg measure/apply shell + the command
 * orchestration live alongside; this core is unit-tested without a toolchain.
 *
 * The limiter knot: a brickwall limiter is non-linear, so it can't be a render-
 * time scalar. It's applied in the AUDIO MIX filter graph (volume→alimiter) from
 * params COMMITTED in the measurement — mixHash covers the mix INPUTS (unchanged),
 * so the committed gain+limiter still validate and render remuxes audio-only.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type CommittedLimiter,
  type LoudnessMeasurement,
  type PublishProfile,
  LOUDNESS_SCHEMA_VERSION,
  computeMixHash,
  loudnessPathFor,
  measureFile,
  resolveProfile,
} from './loudness.js';

export class MasterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MasterError';
  }
}

/** How much gain-reduction the limiter may apply to buy headroom (dB). */
export const DEFAULT_MAX_GR_DB = 6;

/** The limiter spec (from `glissade.master.json`). */
export interface MasterLimiter {
  /** true-peak brickwall (the only mode today). */
  readonly mode: 'truepeak';
  /** the true-peak ceiling, dBTP (defaults to the profile's `truePeakDb`). */
  readonly ceilingDb?: number;
  /** limiter lookahead, ms (advisory — maps to the ffmpeg attack window). */
  readonly lookaheadMs?: number;
  /** max gain-reduction the limiter may apply (dB); beyond this a member can't
   *  reach the target cleanly and the shared target drops. Default 6. */
  readonly maxGrDb?: number;
}

/** `glissade.master.json`. */
export interface MasterConfig {
  /** publish profile id (youtube/shorts/podcast/broadcast/ebu). */
  readonly profile?: string;
  /** member scene globs (like `gs build`'s `scenes`). */
  readonly members: readonly string[];
  /** the limiter (or `false` to keep the legacy peak-clamp behaviour). */
  readonly limiter?: MasterLimiter | false;
  /** `shared-target` (all members hit one LUFS) or `per-asset` (each hits its own max). */
  readonly consistency?: 'shared-target' | 'per-asset';
}

/** One member's measured input loudness (from the ffmpeg measure pass). */
export interface MemberMeasure {
  readonly id: string;
  /** integrated loudness, LUFS. */
  readonly inputI: number;
  /** true peak, dBTP. */
  readonly inputTp: number;
}

/** The plan for one member: its target + the gain to apply + predicted limiting. */
export interface MemberPlan extends MemberMeasure {
  /** the output LUFS this member is driven to. */
  readonly target: number;
  /** the gain to apply before the limiter, dB. */
  readonly gain: number;
  /** predicted limiter gain-reduction, dB (0 when the raw peak clears the ceiling). */
  readonly grDb: number;
  /** predicted output true peak, dBTP (== ceiling when the limiter engages). */
  readonly predOutTp: number;
  /** true when this member reaches the shared target within the GR budget. */
  readonly reachable: boolean;
}

export interface MasterPlan {
  /** the LUFS target the set is normalized to (shared-target) or the profile cap. */
  readonly sharedTarget: number;
  readonly profileTarget: number;
  readonly ceilingDb: number;
  /** true when a limiter is in play (false = legacy peak-clamp). */
  readonly limiter: boolean;
  readonly maxGrDb: number;
  readonly members: readonly MemberPlan[];
}

/** The loudest LUFS this member can reach under the ceiling given the GR budget. */
function maxReachable(m: MemberMeasure, ceilingDb: number, maxGrDb: number, profileTarget: number): number {
  // raw peak headroom (no limiter) = ceiling - inputTp; the limiter buys `maxGrDb`
  // more on top. Never exceed the profile's own target (we don't over-drive).
  return Math.min(profileTarget, m.inputI + (ceilingDb - m.inputTp) + maxGrDb);
}

/**
 * Plan a master pass. Pure: measured members → shared target + per-member gains.
 *
 * - With a limiter, a member reaches `target` by applying `gain = target - inputI`
 *   and the limiter shaves any overshoot (`grDb`) down to the ceiling.
 * - Without a limiter (`limiter: null`), the gain is peak-CLAMPED (the legacy
 *   `min(target-inputI, ceiling-inputTp)`), so a peaky member lands below target.
 * - `shared-target` normalizes every member to one LUFS (the loudest all reach);
 *   `per-asset` drives each to its own max.
 */
export function planMaster(
  measures: readonly MemberMeasure[],
  profile: PublishProfile,
  opts: { limiter: MasterLimiter | null; consistency: 'shared-target' | 'per-asset' },
): MasterPlan {
  if (measures.length === 0) throw new MasterError('planMaster needs at least one measured member');
  const ceilingDb = opts.limiter?.ceilingDb ?? profile.truePeakDb;
  const maxGrDb = opts.limiter ? (opts.limiter.maxGrDb ?? DEFAULT_MAX_GR_DB) : 0;
  const profileTarget = profile.targetLufs;

  // the loudest each member can reach; the shared target is the quietest of those.
  const reach = measures.map((m) => maxReachable(m, ceilingDb, maxGrDb, profileTarget));
  const sharedTarget = Math.min(profileTarget, ...reach);

  const members = measures.map((m, i): MemberPlan => {
    const target = opts.consistency === 'shared-target' ? sharedTarget : reach[i]!;
    // gain to hit the target; without a limiter it's peak-clamped so we never clip.
    const rawGain = target - m.inputI;
    const gain = opts.limiter ? rawGain : Math.min(rawGain, ceilingDb - m.inputTp);
    const postGainTp = m.inputTp + gain;
    const grDb = opts.limiter ? Math.max(0, postGainTp - ceilingDb) : 0;
    const predOutTp = Math.min(ceilingDb, postGainTp);
    // reachable = the member hits the shared target within the GR budget (a
    // non-limiter member is "reachable" only when the peak doesn't clamp it short).
    const reachable = opts.limiter
      ? grDb <= maxGrDb + 1e-6
      : rawGain <= ceilingDb - m.inputTp + 1e-6;
    return { ...m, target, gain: round2(gain), grDb: round2(grDb), predOutTp: round2(predOutTp), reachable };
  });

  return { sharedTarget: round2(sharedTarget), profileTarget, ceilingDb, limiter: opts.limiter !== null, maxGrDb, members };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── the ffmpeg shell + command ───────────────────────────────────────────────

/**
 * The `-af` chain that applies a master's gain + (optional) TRUE-peak limiter to a
 * WAV — the SAME {@link loudnessFilterNodes} the render `filter_complex` applies,
 * so the `gs master` verify pass measures exactly what a render will produce.
 */
export async function masterAfChain(gainDb: number, limiter: CommittedLimiter | null): Promise<string> {
  const { loudnessFilterNodes } = await import('./audioMix.js');
  const nodes = loudnessFilterNodes(gainDb, limiter ?? undefined);
  return nodes.length ? nodes.join(',') : 'anull';
}

export interface MasterMemberResult {
  readonly id: string;
  readonly loudnessPath: string;
  readonly measurement: LoudnessMeasurement;
  /** measured input LUFS / dBTP. */
  readonly inputI: number;
  readonly inputTp: number;
  /** VERIFIED output LUFS / dBTP (re-measured after gain+limiter). */
  readonly outI: number;
  readonly outTp: number;
  readonly gain: number;
  readonly grDb: number;
  /** true when the verified output true-peak exceeded the ceiling (shouldn't happen). */
  readonly overCeiling: boolean;
}

export interface MasterResult {
  readonly sharedTarget: number;
  readonly ceilingDb: number;
  readonly limiter: boolean;
  readonly members: readonly MasterMemberResult[];
  readonly report: string;
}

export interface MasterCommandOptions {
  configPath: string;
  onLog?: (line: string) => void;
}

/**
 * `gs master <glissade.master.json>` — measure every member, plan the shared
 * target + limiter, apply+VERIFY per member, and commit `<scene>.loudness.json`
 * ×N. Reuses `buildMixWav`/`measureFile` (measure) and `resolveScenes` (globs);
 * writes the existing sidecar shape + the `limiter` block so render composes it as
 * a mix-only remux under the mixHash preflight.
 */
export async function masterCommand(opts: MasterCommandOptions): Promise<MasterResult> {
  const raw = JSON.parse(readFileSync(opts.configPath, 'utf8')) as unknown;
  const cfg = normalizeMasterConfig(raw);
  const { resolveScenes } = await import('./build.js');
  const members = resolveScenes(cfg.members, process.cwd());
  if (members.length === 0) throw new MasterError(`master: no scenes matched members ${JSON.stringify(cfg.members)}`);
  return runMaster(members, { profile: cfg.profile, limiter: cfg.limiter, consistency: cfg.consistency }, opts.onLog);
}

/** The shared-target loudness options a master pass needs, minus the member list. */
export interface MasterRunOptions {
  profile?: string;
  limiter?: MasterLimiter | false | null;
  consistency?: 'shared-target' | 'per-asset';
}

/**
 * The master core, callable with ALREADY-RESOLVED member paths + options — so both
 * `gs master <glissade.master.json>` and the 0.43 project runtime's shared-master
 * phase drive it (the runtime passes the project's scenes as members directly, no
 * temp config file). Measures every member's mix, plans one shared target, and
 * commits `<scene>.loudness.json` ×N with the limiter block (render applies it as a
 * mix-only remux under the mixHash preflight).
 */
export async function runMaster(
  members: readonly string[],
  opts: MasterRunOptions = {},
  onLog?: (line: string) => void,
): Promise<MasterResult> {
  const profile = resolveProfile(opts.profile ?? 'youtube');
  const consistency: 'shared-target' | 'per-asset' = opts.consistency ?? 'shared-target';
  const limiter: MasterLimiter | null = opts.limiter || null;
  const log = onLog ?? ((): void => {});

  const { buildMixWav, collectMixAudioInputs } = await import('./render.js');
  if (members.length === 0) throw new MasterError('master: no members to master');

  const ceilingDb = limiter?.ceilingDb ?? profile.truePeakDb;
  const committedLimiter: CommittedLimiter | null = limiter ? { mode: 'truepeak', ceilingDb } : null;

  const tmp = mkdtempSync(join(tmpdir(), 'glissade-master-'));
  try {
    // ── phase 1: measure every member (the shared target needs all inputs) ──
    const measured: { id: string; modulePath: string; wavPath: string; inputI: number; inputTp: number; inputLra: number }[] = [];
    for (const modulePath of members) {
      const wavPath = join(tmp, `${measured.length}.wav`);
      const built = await buildMixWav({ modulePath, narration: 'auto', music: 'auto', sfx: 'auto' }, wavPath);
      if (!built) {
        log(`  skip ${modulePath} (no audio to master)`);
        continue;
      }
      const m = measureFile(wavPath);
      measured.push({ id: modulePath, modulePath, wavPath, ...m });
    }
    if (measured.length === 0) throw new MasterError('master: no members had any audio to measure');

    // ── plan the shared target across all members ──
    const plan = planMaster(
      measured.map((m) => ({ id: m.id, inputI: m.inputI, inputTp: m.inputTp })),
      profile,
      { limiter, consistency },
    );
    log(`shared target ${plan.sharedTarget} LUFS, ceiling ${ceilingDb} dBTP${plan.limiter ? '' : ' (no limiter — legacy peak-clamp)'}`);

    // ── phase 2: apply + VERIFY + commit per member ──
    const results: MasterMemberResult[] = [];
    for (let i = 0; i < measured.length; i++) {
      const meas = measured[i]!;
      const p = plan.members[i]!;
      // apply gain+limiter to a temp WAV and re-measure — the honest OUTPUT number
      const outWav = join(tmp, `${i}.out.wav`);
      const af = await masterAfChain(p.gain, committedLimiter);
      const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', '-i', meas.wavPath, '-af', af, '-c:a', 'pcm_s16le', '-ar', '48000', outWav], { encoding: 'utf8' });
      if (r.status !== 0) throw new MasterError(`ffmpeg master apply failed for ${meas.id} (exit ${r.status}):\n${(r.stderr ?? '').slice(-800)}`);
      const out = measureFile(outWav);

      const extraInputs = await collectMixAudioInputs({ modulePath: meas.modulePath, narration: 'auto', music: 'auto', sfx: 'auto' });
      const measurement: LoudnessMeasurement = {
        loudnessVersion: LOUDNESS_SCHEMA_VERSION,
        profileId: profile.id,
        inputI: round2(meas.inputI),
        inputTp: round2(meas.inputTp),
        inputLra: round2(meas.inputLra),
        gain: p.gain,
        mixHash: computeMixHash(meas.modulePath, extraInputs),
        ...(committedLimiter ? { limiter: committedLimiter } : {}),
      };
      const loudnessPath = loudnessPathFor(meas.modulePath);
      writeFileSync(loudnessPath, JSON.stringify(measurement, null, 2) + '\n');

      const overCeiling = round2(out.inputTp) > ceilingDb + 0.05;
      results.push({
        id: meas.id, loudnessPath, measurement,
        inputI: round2(meas.inputI), inputTp: round2(meas.inputTp),
        outI: round2(out.inputI), outTp: round2(out.inputTp),
        gain: p.gain, grDb: p.grDb, overCeiling,
      });
      log(
        `  ${short(meas.id)}  in ${round2(meas.inputI)}/${round2(meas.inputTp)}dBTP -> ${p.gain >= 0 ? '+' : ''}${p.gain}dB${p.grDb > 0 ? `,${p.grDb}dB GR` : ''}  out ${round2(out.inputI)}/${round2(out.inputTp)}${overCeiling ? '  ⚠ OVER CEILING' : ''}`,
      );
    }

    const report = `gs master: ${results.length} member${results.length === 1 ? '' : 's'} → shared target ${plan.sharedTarget} LUFS / ${ceilingDb} dBTP${plan.limiter ? ' (true-peak limiter)' : ''}, wrote <scene>.loudness.json ×${results.length}`;
    return { sharedTarget: plan.sharedTarget, ceilingDb, limiter: plan.limiter, members: results, report };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function short(p: string): string {
  return p.replace(/^.*\//, '').replace(/\.[jt]sx?$/, '');
}

/** Validate + normalize a parsed `glissade.master.json` (fail-loud). */
export function normalizeMasterConfig(raw: unknown): Required<Pick<MasterConfig, 'members' | 'consistency'>> & { profile: string; limiter: MasterLimiter | null } {
  if (raw === null || typeof raw !== 'object') throw new MasterError('master config must be an object');
  const c = raw as MasterConfig;
  if (!Array.isArray(c.members) || c.members.length === 0) {
    throw new MasterError('master config needs a non-empty `members` array of scene globs');
  }
  const consistency = c.consistency ?? 'shared-target';
  if (consistency !== 'shared-target' && consistency !== 'per-asset') {
    throw new MasterError(`master `+`consistency must be 'shared-target' or 'per-asset' (got '${consistency}')`);
  }
  let limiter: MasterLimiter | null;
  if (c.limiter === false) {
    limiter = null;
  } else if (c.limiter === undefined) {
    limiter = { mode: 'truepeak' }; // limiter ON by default — that's the whole point
  } else if (typeof c.limiter === 'object' && c.limiter.mode === 'truepeak') {
    limiter = c.limiter;
  } else {
    throw new MasterError(`master limiter must be { mode: 'truepeak', ceilingDb?, maxGrDb?, lookaheadMs? } or false`);
  }
  if (limiter && limiter.maxGrDb !== undefined && !(limiter.maxGrDb >= 0)) {
    throw new MasterError(`master limiter.maxGrDb must be >= 0 (got ${limiter.maxGrDb})`);
  }
  return { members: c.members, consistency, profile: c.profile ?? 'youtube', limiter };
}

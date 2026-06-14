/**
 * gs sfx — the explicit sound-effects prepare step, and the render-time
 * auto-mix half. Like narration, synthesis happens HERE: the prepare step
 * resolves each hit's time (absolute, or anchored to a narration beat so it
 * re-flows on re-narrate), renders the referenced voices to a committed WAV
 * cache (deduped), applies deterministic index-seeded pitch/gain variation, and
 * writes a committed `<base>.sfx.timing.json`. gs render consumes that manifest,
 * fully offline — a sibling next to the scene joins the mix with zero config.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { narration, type NarrationTiming } from '@glissade/narrate';
import { buildSfxClips, renderSfxAssets, sfxFileName, sfxrSource, type SfxHit, type SfxSource } from '@glissade/sfx';
import type { AudioClip } from '@glissade/core';

// ---- the authored script (committed next to the scene module) ----

export interface SfxScriptHit {
  /** a voice id of the source (e.g. an sfxr preset: 'click', 'pop', …) */
  voice: string;
  /** narration beat id to anchor to; resolves against the sibling narration timing */
  anchor?: string;
  /** seconds added to the anchor start (or ignored when `at` is used) */
  offset?: number;
  /** absolute timeline seconds — mutually exclusive with `anchor` */
  at?: number;
  /** per-hit linear gain; default 1 */
  gain?: number;
}

export interface SfxScript {
  sfxVersion: 1;
  /** v1 supports the procedural 'sfxr' bank (default); sample packs via code */
  source?: 'sfxr';
  sampleRate?: number;
  /** scene seed for the index-seeded variation; default 0 */
  seed?: number;
  jitterRate?: number;
  jitterGain?: number;
  /** overall gain on every hit; default 1 */
  gain?: number;
  hits: SfxScriptHit[];
}

// ---- the generated timing manifest (committed; the render-time input) ----

export interface SfxTimedClip {
  voice: string;
  at: number;
  /** committed WAV filename within the cache dir */
  file: string;
  gain?: number;
  playbackRate?: number;
}

export interface SfxTiming {
  sfxTimingVersion: 1;
  source: string;
  clips: SfxTimedClip[];
}

export class SfxCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SfxCliError';
  }
}

/** `<scene>.sfx.json` for a scene module, or the script path itself. */
export function sfxScriptPathFor(input: string): string {
  if (input.endsWith('.sfx.json')) return input;
  const candidate = input.replace(/\.[jt]sx?$/, '') + '.sfx.json';
  if (!existsSync(candidate)) {
    throw new SfxCliError(`no sfx script at ${candidate} — create it or pass the script path directly`);
  }
  return candidate;
}

/** `<module>.sfx.timing.json`, when the scene has effects. */
export function sfxTimingPathFor(modulePath: string): string | null {
  const candidate = modulePath.replace(/\.[jt]sx?$/, '') + '.sfx.timing.json';
  return existsSync(candidate) ? candidate : null;
}

export interface PrepareSfxResult {
  timingPath: string;
  cacheDir: string;
  voices: string[];
  clipCount: number;
}

/**
 * Resolve, render, and commit a scene's sound effects. Anchored hits are
 * resolved against the sibling `<base>.narration.timing.json`; absolute hits
 * use their `at`. The referenced voices render once each (deduped) to
 * `<base>.sfx-cache/`, and the index-seeded jitter is baked into the committed
 * clip list — so render is a pure read of the manifest.
 */
export function prepareSfx(scriptPath: string): PrepareSfxResult {
  if (!scriptPath.endsWith('.sfx.json')) throw new SfxCliError(`script path must end with .sfx.json: ${scriptPath}`);
  const raw = JSON.parse(readFileSync(scriptPath, 'utf8')) as SfxScript;
  if (raw.sfxVersion !== 1) throw new SfxCliError(`unsupported sfxVersion ${String(raw.sfxVersion)}`);
  if ((raw.source ?? 'sfxr') !== 'sfxr') {
    throw new SfxCliError(`gs sfx v1 supports source 'sfxr' only; use buildSfxClips() in code for sample packs`);
  }
  const source: SfxSource = sfxrSource(raw.sampleRate !== undefined ? { sampleRate: raw.sampleRate } : {});
  const validVoices = new Set(source.voices().map((v) => v.id));

  const base = scriptPath.replace(/\.sfx\.json$/, '');
  // anchors resolve against the committed narration timing, if present
  const narrationPath = `${base}.narration.timing.json`;
  let beats: ReturnType<typeof narration> | null = null;
  const loadBeats = (): ReturnType<typeof narration> => {
    if (beats) return beats;
    if (!existsSync(narrationPath)) {
      throw new SfxCliError(`hit anchors a narration beat but no ${basename(narrationPath)} found — run gs narrate first`);
    }
    beats = narration(JSON.parse(readFileSync(narrationPath, 'utf8')) as NarrationTiming);
    return beats;
  };

  const hits: SfxHit[] = raw.hits.map((h, i) => {
    if (!validVoices.has(h.voice)) {
      throw new SfxCliError(`hit ${i}: unknown voice '${h.voice}' (have: ${[...validVoices].join(', ')})`);
    }
    const hasAnchor = h.anchor !== undefined;
    const hasAt = h.at !== undefined;
    if (hasAnchor === hasAt) throw new SfxCliError(`hit ${i} ('${h.voice}') needs exactly one of 'anchor' or 'at'`);
    const at = hasAnchor ? loadBeats().at(h.anchor!, h.offset ?? 0) : h.at!;
    return { voice: h.voice, at, ...(h.gain !== undefined ? { gain: h.gain } : {}) };
  });

  // bake the deterministic jitter into the committed clip list (mirrors how
  // gs narrate commits durations) — render never recomputes it
  const clips = buildSfxClips(hits, source, {
    seed: raw.seed ?? 0,
    ...(raw.jitterRate !== undefined ? { jitterRate: raw.jitterRate } : {}),
    ...(raw.jitterGain !== undefined ? { jitterGain: raw.jitterGain } : {}),
    ...(raw.gain !== undefined ? { gain: raw.gain } : {}),
  });
  const timedClips: SfxTimedClip[] = clips.map((c, i) => ({
    voice: hits[i]!.voice,
    at: c.at,
    file: sfxFileName(source.id, hits[i]!.voice),
    ...(c.gain ? { gain: c.gain.keys[0]!.value as number } : {}),
    ...(c.playbackRate !== undefined ? { playbackRate: c.playbackRate } : {}),
  }));

  // render the referenced voices once each into the cache
  const cacheDir = `${base}.sfx-cache`;
  mkdirSync(cacheDir, { recursive: true });
  const assets = renderSfxAssets(
    source,
    hits.map((h) => h.voice),
  );
  for (const [file, bytes] of Object.entries(assets)) writeFileSync(join(cacheDir, file), bytes);

  const timing: SfxTiming = { sfxTimingVersion: 1, source: source.id, clips: timedClips };
  const timingPath = `${base}.sfx.timing.json`;
  writeFileSync(timingPath, JSON.stringify(timing, null, 2) + '\n');

  return { timingPath, cacheDir, voices: Object.keys(assets), clipCount: timedClips.length };
}

/**
 * Build the effect clips from a sibling timing manifest for render auto-mix.
 * Clip urls stay relative to the cache dir next to the manifest, so the mixer
 * resolves them against the module dir (mirrors buildNarrationClips).
 */
export function buildSfxClipsFromTiming(timingPath: string): { clips: AudioClip[]; note: string } | null {
  const timing = JSON.parse(readFileSync(timingPath, 'utf8')) as SfxTiming;
  if (!timing.clips || timing.clips.length === 0) return null;
  const cacheBase = basename(timingPath).replace(/\.sfx\.timing\.json$/, '') + '.sfx-cache';
  const clips: AudioClip[] = timing.clips.map((c) => ({
    asset: { kind: 'audio' as const, url: `${cacheBase}/${c.file}` },
    at: c.at,
    ...(c.playbackRate !== undefined ? { playbackRate: c.playbackRate } : {}),
    ...(c.gain !== undefined ? { gain: { keys: [{ t: 0, value: c.gain }] } } : {}),
  }));
  const n = clips.length;
  return { clips, note: `sfx (${n} ${n === 1 ? 'hit' : 'hits'})` };
}

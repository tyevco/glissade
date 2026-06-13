/**
 * Render-time audio auto-mix. Sibling manifests next to a scene join the
 * timeline mix automatically: the NARRATION voice (`*.narration.timing.json`)
 * and the MUSIC bed (`*.music.timing.json` with a `stem`), the bed
 * auto-ducked under the voice. Scene + manifests → finished mp4, no
 * hand-wired `timeline.audio`. Author-wired clips are detected and not
 * doubled.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { music, narration, validateMusicTiming, type MusicTiming, type NarrationTiming } from '@glissade/narrate';
import type { AudioClip } from '@glissade/core';
import { resolveAssetPath } from './audioMix.js';

/** `<module>.music.timing.json`, when the scene has a music bed. */
export function musicPathFor(modulePath: string): string | null {
  const candidate = modulePath.replace(/\.[jt]sx?$/, '') + '.music.timing.json';
  return existsSync(candidate) ? candidate : null;
}

/**
 * Build the narration voice clips from a sibling timing manifest — the half
 * of audio auto-mix that 0.4.x's "music parity" was missing (music mixed,
 * narration didn't). Clip urls stay relative to the cache dir, which sits
 * next to the manifest (and the module), so the mixer resolves them against
 * the module dir.
 */
export function buildNarrationClips(timingPath: string): { clips: AudioClip[]; note: string } | null {
  const timing = JSON.parse(readFileSync(timingPath, 'utf8')) as NarrationTiming;
  if (!timing.segments || timing.segments.length === 0) return null;
  const cacheBase = basename(timingPath).replace(/\.narration\.timing\.json$/, '') + '.narration-cache';
  const clips = narration(timing).clips(cacheBase);
  const n = timing.segments.length;
  return { clips, note: `narration (${n} ${n === 1 ? 'segment' : 'segments'})` };
}

export interface AutoMixResult {
  clip: AudioClip;
  /** human-readable description for the render log */
  note: string;
}

/**
 * Build the bed clip from the manifests. The stem path stays relative — the
 * manifest sits next to the module, and the mixer resolves clip urls against
 * the module dir, so the bases coincide.
 */
export function buildMusicClip(
  musicManifestPath: string,
  narrationTimingPath: string | null,
): AutoMixResult | null {
  const timing = JSON.parse(readFileSync(musicManifestPath, 'utf8')) as MusicTiming;
  validateMusicTiming(timing);
  if (!timing.stem) return null; // anchors-only manifest; nothing to mix
  const anchors = music(timing);
  if (narrationTimingPath) {
    const narration = JSON.parse(readFileSync(narrationTimingPath, 'utf8')) as NarrationTiming;
    return {
      clip: anchors.clip(undefined, { duckUnder: narration }),
      note: `music bed '${timing.stem}'${timing.gainDb ? ` at ${timing.gainDb}dB` : ''}, ducked under narration`,
    };
  }
  return {
    clip: anchors.clip(),
    note: `music bed '${timing.stem}'${timing.gainDb ? ` at ${timing.gainDb}dB` : ''}`,
  };
}

/**
 * True when the timeline's audio already references a file (same resolved
 * path) — auto-mix must then SKIP it, or the source plays twice: a coherent
 * duplicate adds +6dB (measured downstream before this guard existed).
 * Used for both the bed and the narration clips.
 */
export function bedAlreadyReferenced(clips: AudioClip[], url: string, modulePath: string): boolean {
  const target = resolveAssetPath(url, modulePath);
  return clips.some((c) => {
    try {
      return resolveAssetPath(c.asset.url, modulePath) === target;
    } catch {
      return false; // remote/unresolvable urls can't be the local file
    }
  });
}

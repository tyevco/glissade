/**
 * Render-time music auto-mix (the narration parity): a committed
 * `<module>.music.timing.json` with a `stem` field next to the scene mixes
 * its bed automatically — and when a narration timing manifest ALSO sits
 * there, the bed auto-ducks under the voice. Zero-config
 * narrated-explainer-with-bed; everything derives from the two manifests.
 */

import { existsSync, readFileSync } from 'node:fs';
import { music, validateMusicTiming, type MusicTiming, type NarrationTiming } from '@glissade/narrate';
import type { AudioClip } from '@glissade/core';
import { resolveAssetPath } from './audioMix.js';

/** `<module>.music.timing.json`, when the scene has a music bed. */
export function musicPathFor(modulePath: string): string | null {
  const candidate = modulePath.replace(/\.[jt]sx?$/, '') + '.music.timing.json';
  return existsSync(candidate) ? candidate : null;
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
 * True when the timeline's audio already references the bed stem (same
 * resolved file) — auto-mix must then SKIP, or the bed plays twice and adds
 * +6dB of coherent doubling (measured downstream before this guard existed).
 */
export function bedAlreadyReferenced(clips: AudioClip[], bedUrl: string, modulePath: string): boolean {
  const bedPath = resolveAssetPath(bedUrl, modulePath);
  return clips.some((c) => {
    try {
      return resolveAssetPath(c.asset.url, modulePath) === bedPath;
    } catch {
      return false; // remote/unresolvable urls can't be the local stem
    }
  });
}

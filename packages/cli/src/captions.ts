/**
 * Render-time caption handling (--captions burn|sidecar|off). Captions are
 * ordinary document data (a string track + a Text node), so hiding them is a
 * DOCUMENT operation: an override track on 'captions/opacity' merged over
 * the scene doc — never a scene-graph mutation.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { compileTimeline, key, timeline, track, type Timeline } from '@glissade/core';
import { toSrt, toVtt, type NarrationTiming } from '@glissade/narrate';

export type CaptionsMode = 'burn' | 'sidecar' | 'off';

export function parseCaptionsMode(raw: string | undefined): CaptionsMode {
  if (raw === undefined || raw === '' || raw === 'burn') return 'burn';
  if (raw === 'sidecar' || raw === 'off') return raw;
  throw new Error(`--captions must be burn, sidecar, or off (got '${raw}')`);
}

/**
 * `<module>.narration.timing.json`, when the scene has been narrated. With a
 * `locale`, PREFER the locale-tagged sibling `<module>.<locale>.narration.timing.json`
 * (0.14 localization core) and fall back to the base sibling when it is absent —
 * so a locale that reuses the base narration still renders. No `locale` (the
 * base path) resolves the base sibling, byte-identical to today.
 */
export function timingPathFor(modulePath: string, locale?: string): string | null {
  if (locale !== undefined && locale !== '') {
    // single-source the locale sibling suffix in locale.ts (one-line convention change)
    const stem = modulePath.replace(/\.[jt]sx?$/, '');
    const localeCandidate = stem + `.${locale}.narration.timing.json`;
    if (existsSync(localeCandidate)) return localeCandidate;
  }
  const candidate = modulePath.replace(/\.[jt]sx?$/, '') + '.narration.timing.json';
  return existsSync(candidate) ? candidate : null;
}

/**
 * Hide the caption node for sidecar/off renders. The override spans the whole
 * duration: coalescing is last-insertion-wins only inside the later track's
 * key range (§2.2), so a point key would lose to an authored opacity track.
 */
export function hideCaptionsDoc(doc: Timeline, captionsId = 'captions'): Timeline {
  const duration = compileTimeline(doc).duration;
  const hide = track(`${captionsId}/opacity`, 'number', [
    key(0, 0, { interp: 'hold' as const }),
    key(Math.max(duration, 1e-6), 0),
  ]);
  return timeline({
    duration,
    ...(doc.fps !== undefined ? { fps: doc.fps } : {}),
    ...(doc.assets !== undefined ? { assets: doc.assets } : {}),
    children: [
      { timeline: doc, at: 0, mode: 'add' },
      { timeline: { version: 1, tracks: [hide] }, at: 0, mode: 'add' },
    ],
  });
}

/** Write .srt + .vtt next to the render output; returns the paths. */
export function writeCaptionSidecars(
  timingPath: string,
  outPath: string,
): { srt: string; vtt: string } {
  const timing = JSON.parse(readFileSync(timingPath, 'utf8')) as NarrationTiming;
  const isFile = /\.(mp4|webm)$/i.test(outPath);
  const dir = isFile ? dirname(outPath) : outPath;
  const stem = isFile ? basename(outPath).replace(/\.(mp4|webm)$/i, '') : 'captions';
  const srt = join(dir, `${stem}.srt`);
  const vtt = join(dir, `${stem}.vtt`);
  writeFileSync(srt, toSrt(timing));
  writeFileSync(vtt, toVtt(timing));
  return { srt, vtt };
}

/**
 * glissade Key[] → Lottie keyframe conversion: the EASE SHIFT read backwards.
 * glissade stores a segment's ease/hold on the ARRIVING key j (the shape of
 * j−1 → j); Lottie stores BOTH handles on the DEPARTING key j−1 (`o`/`i`) plus
 * `h:1` for a hold. This is the exact inverse of `keyframes.ts`'s
 * `departingEase`/`convertKeys`. Times are `round(t_sec * fr)`.
 *
 * Only cubicBezier + hold + linear eases invert directly (they round-trip the
 * shipped importer EXACTLY). Named eases, springs, and expr tracks are NOT
 * representable as a single Lottie bezier handle — those are baked to dense
 * linear keys by `sampleFallback.ts` instead (see {@link isDirectlyInvertible}).
 */

import type { EaseSpec, Key } from '@glissade/core';
import type { LottieEaseHandle, LottieKeyframe } from './types.js';

/** Seconds → Lottie frame index (offset 0, st 0), matching the importer's toSeconds inverse. */
export const toFrames = (tSec: number, fr: number): number => Math.round(tSec * fr);

/**
 * A cubicBezier / linear ease → the DEPARTING key's `o`/`i` handles. Linear
 * (undefined ease) is the bezier identity `o:{0,0} i:{1,1}` — which the importer
 * reads back as linear (departingEase returns undefined when x≈y on both
 * handles). Returns undefined for an ease that is NOT a plain bezier (a named
 * string or a spring) — the caller must sample that track instead.
 */
export function easeHandles(ease: EaseSpec | undefined): { o: LottieEaseHandle; i: LottieEaseHandle } | undefined {
  if (ease === undefined) return { o: { x: 0, y: 0 }, i: { x: 1, y: 1 } };
  if (typeof ease === 'object' && ease.kind === 'cubicBezier') {
    const [x1, y1, x2, y2] = ease.pts;
    return { o: { x: x1, y: y1 }, i: { x: x2, y: y2 } };
  }
  return undefined; // named ease / spring — not a single-bezier segment
}

/**
 * True when EVERY segment of the track is directly invertible to a Lottie
 * bezier: linear (no ease), cubicBezier, or hold. A named-string ease, a spring,
 * or an expr track is not — those are baked by sampling. (The ease lives on the
 * ARRIVING key, so segment j is described by `keys[j]`.)
 */
export function isDirectlyInvertible(keys: readonly Key<unknown>[], expr?: string): boolean {
  if (expr !== undefined) return false;
  for (let j = 1; j < keys.length; j++) {
    const k = keys[j]!;
    if (k.interp === 'hold') continue;
    if (k.ease === undefined) continue;
    if (typeof k.ease === 'object' && k.ease.kind === 'cubicBezier') continue;
    return false;
  }
  return true;
}

/**
 * Emit Lottie keyframes with the ease shift: the ease/hold glissade stores on
 * ARRIVING key j+1 becomes the DEPARTING handles/hold of Lottie key j. `toS`
 * maps a glissade value to the Lottie `s` payload (a scalar `[v]`, a vec2
 * `[x,y]`, or an sh path-data array). Assumes {@link isDirectlyInvertible}.
 */
export function emitKeys<T, S>(keys: readonly Key<T>[], fr: number, toS: (v: T) => S): LottieKeyframe[] {
  const out: LottieKeyframe[] = [];
  for (let j = 0; j < keys.length; j++) {
    const k = keys[j]!;
    const frame: LottieKeyframe = { t: toFrames(k.t, fr), s: toS(k.value) };
    const next = keys[j + 1];
    if (next !== undefined) {
      // the DEPARTING segment (j → j+1) is described by glissade key j+1
      if (next.interp === 'hold') frame.h = 1;
      else {
        const h = easeHandles(next.ease);
        if (h !== undefined) {
          frame.o = h.o;
          frame.i = h.i;
        }
      }
    }
    out.push(frame);
  }
  return out;
}

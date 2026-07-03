/**
 * Dense-bake fallback for tracks that can't invert to a single Lottie bezier:
 * named eases, springs, and expr formulas. The track is SAMPLED on the document
 * frame grid via core's `sampleTrack` (the identical evaluator the runtime uses)
 * and emitted as linear-handle Lottie keys — the same discipline the importer
 * uses for misaligned parametric geometry (convert.ts). A cubicBezier/hold track
 * never comes here; it round-trips exactly through {@link emitKeys}.
 */

// Register the expr compiler (a bare side-effect import) so an expr-driven track
// can be sampled here. `@glissade/core/expr` is EXTERNAL in this package's build
// (tsdown externalizes `@glissade/*`), so the import statement — and its
// compiler-registration side effect — survives into the shipped dist.
import '@glissade/core/expr';

import { sampleTrack, type Track } from '@glissade/core';
import { toFrames } from './emitKeyframes.js';
import type { LottieKeyframe } from './types.js';

/**
 * Sample `tr` at every integer frame across its keyed span (or the whole
 * document `[ip, op]` for an expr track with no keys) and emit linear Lottie
 * keys. `toS` maps a sampled value to the Lottie `s` payload.
 */
export function sampleToLottieKeys<T, S>(
  tr: Track<T>,
  fr: number,
  ip: number,
  op: number,
  toS: (v: T) => S,
): LottieKeyframe[] {
  const keys = tr.keys;
  let f0 = ip;
  let f1 = op;
  if (keys.length > 0) {
    f0 = toFrames(keys[0]!.t, fr);
    f1 = toFrames(keys[keys.length - 1]!.t, fr);
  }
  const out: LottieKeyframe[] = [];
  for (let f = f0; f <= f1; f++) {
    const value = sampleTrack(tr, f / fr);
    const frame: LottieKeyframe = { t: f, s: toS(value) };
    // linear handles between samples; the last key has no departing segment
    if (f < f1) {
      frame.o = { x: 0, y: 0 };
      frame.i = { x: 1, y: 1 };
    }
    out.push(frame);
  }
  return out;
}

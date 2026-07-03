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
 * keys, then DECIMATE redundant ones ({@link decimateLinearKeys}). `toS` maps a
 * sampled value to the Lottie `s` payload.
 *
 * Dense per-frame sampling is faithful but huge — a spring or named ease over a
 * long shot densifies to one key per frame on every channel (a real episode
 * measured ~148k keys / 139 MB). Since Lottie plays LINEAR between keys, most of
 * those samples lie on the straight run between two others and are redundant;
 * decimation drops them within a per-component tolerance, collapsing constant and
 * constant-velocity stretches to their endpoints while keeping the curvature.
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
  return anchorSampledSpan(decimateLinearKeys(out), f0, f1, ip, op, (frame) => toS(sampleTrack(tr, frame / fr)));
}

/**
 * Anchor the document boundaries of a densely-SAMPLED channel whose keyed span
 * [f0,f1] doesn't reach the document bounds [ip,op]. Lottie extrapolates a channel
 * by HOLDING its first key backward and its last key forward, so when the span
 * starts AFTER ip the first EMITTED sample holds backward across the whole leading
 * dormant run — and for a fade-in whose first key rounds to a frame PAST the fade
 * start (a fractional key time, `round(t·fr) > t·fr`), that first sample is already
 * non-zero (e.g. ~9%), so a "hidden" element GHOSTS at ~9% from t=0 instead of 0.
 * Make the true base explicit:
 *   • f0 > ip → PREPEND a HOLD key at ip carrying `sampleAt(ip)` — the value
 *     `sampleTrack` holds across the dormant run (0 for a dormant-at-0 fade). HELD,
 *     not linearly ramped, so a long dormant window stays at the base value the
 *     whole way instead of sloping up to the first sample.
 *   • f1 < op → APPEND a key at op carrying `sampleAt(op)`. Lottie already holds
 *     the last key forward, but a fractional last-key round-DOWN leaves the true
 *     tail value unsampled (e.g. a fade-out whose final 0 is skipped); this pins it.
 * `body` is the already-decimated sampled keyframes; the boundary keys sit OUTSIDE
 * it, so decimation (which assumes pure linear segments) never touches them. A span
 * that already covers [ip,op] (the common integer-keyed case) returns `body`
 * unchanged — byte-identical to before this fix.
 */
export function anchorSampledSpan(
  body: LottieKeyframe[],
  f0: number,
  f1: number,
  ip: number,
  op: number,
  sampleAt: (frame: number) => LottieKeyframe['s'],
): LottieKeyframe[] {
  if (body.length === 0 || (f0 <= ip && f1 >= op)) return body;
  const out = body.slice();
  if (f1 < op) {
    // the old last key gains a departing linear segment toward the new op key
    const last = out[out.length - 1]!;
    out[out.length - 1] = { ...last, o: { x: 0, y: 0 }, i: { x: 1, y: 1 } };
    out.push({ t: op, s: sampleAt(op) });
  }
  if (f0 > ip) {
    // HOLD the base across the dormant run so it stays hidden, not ramped
    out.unshift({ t: ip, s: sampleAt(ip), h: 1 });
  }
  return out;
}

/**
 * Ramer–Douglas–Peucker over linear-interpolated keyframes: keep the endpoints
 * plus any interior key whose value is NOT reproduced (within `relEps` of each
 * component's range) by linear interpolation between the kept neighbors — those
 * are exactly the keys Lottie's linear playback can't recreate, so the rest are
 * safe to drop. Endpoints (first/last, hence the exact start/end value and time)
 * are always kept; existing linear handles on the survivors stay valid. Only
 * flat-numeric `s` payloads are decimated — path `sh` data (nested vertex arrays)
 * is left dense. `relEps` is a fraction of each channel's value range, so it is
 * scale-invariant across position (px), opacity (0–100), scale (×100), color (0–1).
 */
export function decimateLinearKeys(keys: LottieKeyframe[], relEps = 0.002): LottieKeyframe[] {
  const n = keys.length;
  if (n <= 2) return keys;
  const isFlat = (s: unknown): s is number[] => Array.isArray(s) && s.every((x) => typeof x === 'number');
  if (!keys.every((k) => isFlat(k.s))) return keys;
  const sAt = (i: number): number[] => keys[i]!.s as number[];
  const dim = sAt(0).length;

  // per-component range → normalize deviation so one tolerance fits every channel
  const min = new Array<number>(dim).fill(Infinity);
  const max = new Array<number>(dim).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    const s = sAt(i);
    for (let c = 0; c < dim; c++) {
      const v = s[c]!;
      if (v < min[c]!) min[c] = v;
      if (v > max[c]!) max[c] = v;
    }
  }
  const invRange = new Array<number>(dim);
  for (let c = 0; c < dim; c++) {
    const r = max[c]! - min[c]!;
    invRange[c] = r > 1e-9 ? 1 / r : 0; // a constant channel never forces a split
  }

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    if (hi - lo < 2) continue;
    const a = sAt(lo);
    const b = sAt(hi);
    const ta = keys[lo]!.t;
    const span = keys[hi]!.t - ta;
    let worst = -1;
    let worstDev = relEps; // only split when the chord deviates beyond the tolerance
    for (let i = lo + 1; i < hi; i++) {
      const s = sAt(i);
      const f = span > 0 ? (keys[i]!.t - ta) / span : 0;
      let dev = 0;
      for (let c = 0; c < dim; c++) {
        const chord = a[c]! + (b[c]! - a[c]!) * f;
        const d = Math.abs(s[c]! - chord) * invRange[c]!;
        if (d > dev) dev = d;
      }
      if (dev > worstDev) {
        worstDev = dev;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([lo, worst], [worst, hi]);
    }
  }

  const out: LottieKeyframe[] = [];
  for (let i = 0; i < n; i++) if (keep[i] === 1) out.push(keys[i]!);
  return out;
}

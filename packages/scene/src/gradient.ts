/**
 * Gradient stop densification (§3 Paint, 0.10.1). Canvas gradients interpolate
 * BETWEEN stops linearly in the canvas color space, which Mach-bands a 2-3 stop
 * soft-light fill. For `smooth`/`gaussian` interpolation we resample the stops
 * into a dense ramp eased per-segment with oklab `lerpColor`, so the blit melts
 * like a wide blur with no banding and no filter. Pure + deterministic: the same
 * (stops, mode) always produce the same dense stops, so Skia stays byte-exact.
 * `linear` is the canvas-native ramp and is never densified (byte-identical).
 */

import { lerpColor, type ColorStop, type GradientInterpolation } from '@glissade/core';

/** Resolution of the densified ramp — enough that the piecewise-linear blit of
 * the easing curve shows no banding, cheap enough to rebuild per frame. */
export const GRADIENT_RAMP_STEPS = 64;

const smoothstep = (u: number): number => u * u * (3 - 2 * u);

// gaussian shoulder: a soft falloff (flat-ish bright plateau → gaussian tail),
// normalized so ease(0)=0 and ease(1)=1. K sets the shoulder width.
const GAUSS_K = 2.4;
const GAUSS_NORM = 1 - Math.exp(-(GAUSS_K * GAUSS_K) / 2);
const gaussianEase = (u: number): number => (1 - Math.exp(-((u * GAUSS_K) ** 2) / 2)) / GAUSS_NORM;

/**
 * Densify `stops` into a `smooth`/`gaussian` oklab ramp. The output spans the
 * input's offset range with GRADIENT_RAMP_STEPS uniformly-spaced stops; each
 * point eases its blend within the authored segment it falls in. Returns the
 * input unchanged for `linear` (or a single stop) — the canvas-native path.
 */
export function densifyStops(stops: ColorStop[], mode: GradientInterpolation): ColorStop[] {
  if (mode === 'linear' || stops.length < 2) return stops;
  const ease = mode === 'gaussian' ? gaussianEase : smoothstep;
  const o0 = stops[0]!.offset;
  const o1 = stops[stops.length - 1]!.offset;
  const span = o1 - o0;
  if (span <= 0) return stops;
  const out: ColorStop[] = [];
  let seg = 0;
  for (let i = 0; i < GRADIENT_RAMP_STEPS; i++) {
    const t = i / (GRADIENT_RAMP_STEPS - 1);
    const offset = o0 + span * t;
    // advance to the authored segment [stops[seg], stops[seg+1]] containing offset
    while (seg < stops.length - 2 && offset > stops[seg + 1]!.offset) seg++;
    const a = stops[seg]!;
    const b = stops[seg + 1]!;
    const w = b.offset - a.offset;
    const u = w > 0 ? Math.min(1, Math.max(0, (offset - a.offset) / w)) : 0;
    out.push({ offset, color: lerpColor(a.color, b.color, ease(u)) });
  }
  return out;
}

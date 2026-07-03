/**
 * Geometry conversion glissade → Lottie sh data: the inverse of
 * `pathvalue.ts`'s `shToContour`. A glissade PathContour (vertex form, RELATIVE
 * in/out tangents) IS Lottie's own `{v,i,o,c}` representation, so this is a
 * field transliteration. Rect/Circle primitives synthesize their contour with
 * the SAME `rectContour`/`ellipseContour` the importer builds from, so a static
 * shape round-trips its geometry byte-for-byte.
 */

import type { PathContour, PathValue, Vec2 } from '@glissade/core';
import type { LottieShapePathData } from './types.js';

const pt = (p: Vec2): number[] => [p[0], p[1]];

/** One PathContour → one Lottie sh path object (inverse of shToContour). */
export function contourToShData(c: PathContour): LottieShapePathData {
  return { v: c.v.map(pt), i: c.in.map(pt), o: c.out.map(pt), c: c.closed };
}

/**
 * A PathValue (contour list) → the Lottie sh keyframe `s` payload: an array of
 * path objects (the importer's `toValue` maps `Array.isArray(v) ? v : [v]`, so
 * an array is the general, always-correct shape — including the single-contour
 * case).
 */
export function pathValueToShData(pv: PathValue): LottieShapePathData[] {
  return pv.map(contourToShData);
}

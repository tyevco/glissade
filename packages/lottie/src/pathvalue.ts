/**
 * Geometry conversion: Lottie sh path data, parametric el/rc → PathValue
 * (bezier contours in vertex form with RELATIVE tangents — Lottie's own
 * representation, so sh conversion is a transliteration).
 */

import type { PathContour, PathValue, Vec2 } from '@glissade/core';
import type { LottieShapePathData } from './types.js';

const v2 = (p: number[] | undefined): Vec2 => [p?.[0] ?? 0, p?.[1] ?? 0];

/** sh data → one contour. `closedFallback` covers the old top-level `closed` flag. */
export function shToContour(data: LottieShapePathData, closedFallback?: boolean): PathContour {
  return {
    closed: data.c ?? closedFallback ?? false,
    v: data.v.map(v2),
    in: data.i.map(v2),
    out: data.o.map(v2),
  };
}

/**
 * Bezier circle constant used by AE/lottie-web for ellipses and round rect
 * corners. The resulting control points are LINEAR in the radius, so lerping
 * converted contours equals converting lerped sizes (exact per-key import).
 */
export const KAPPA = 0.5519;

/** el (ellipse): center p, size s → 4-vertex kappa-form contour. */
export function ellipseContour(center: Vec2, size: Vec2): PathContour {
  const rx = size[0] / 2;
  const ry = size[1] / 2;
  const [cx, cy] = center;
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  // lottie-web vertex order: top, right, bottom, left (clockwise, y-down)
  return {
    closed: true,
    v: [
      [cx, cy - ry],
      [cx + rx, cy],
      [cx, cy + ry],
      [cx - rx, cy],
    ],
    in: [
      [-kx, 0],
      [0, -ky],
      [kx, 0],
      [0, ky],
    ],
    out: [
      [kx, 0],
      [0, ky],
      [-kx, 0],
      [0, -ky],
    ],
  };
}

/** rc (rectangle): center p, size s, corner radius r → contour (kappa corners). */
export function rectContour(center: Vec2, size: Vec2, radius: number): PathContour {
  const w = size[0] / 2;
  const h = size[1] / 2;
  const [cx, cy] = center;
  const r = Math.min(Math.max(0, radius), w, h);
  if (r <= 0) {
    const z: Vec2 = [0, 0];
    return {
      closed: true,
      v: [
        [cx + w, cy - h],
        [cx + w, cy + h],
        [cx - w, cy + h],
        [cx - w, cy - h],
      ],
      in: [z, z, z, z],
      out: [z, z, z, z],
    };
  }
  const k = KAPPA * r;
  const z: Vec2 = [0, 0];
  // clockwise from the start of the top-right corner arc (lottie draw order)
  return {
    closed: true,
    v: [
      [cx + w - r, cy - h],
      [cx + w, cy - h + r],
      [cx + w, cy + h - r],
      [cx + w - r, cy + h],
      [cx - w + r, cy + h],
      [cx - w, cy + h - r],
      [cx - w, cy - h + r],
      [cx - w + r, cy - h],
    ],
    in: [z, [0, -k], z, [k, 0], z, [0, k], z, [-k, 0]],
    out: [[k, 0], z, [0, k], z, [-k, 0], z, [0, -k], z],
  };
}

/**
 * Reverse a contour's winding (Lottie shape direction d:3): reversed vertex
 * order with in/out tangents exchanged. Winding decides nonzero-merge holes.
 */
export function reverseContour(c: PathContour): PathContour {
  const idx = c.v.map((_, i) => i).reverse();
  return {
    closed: c.closed,
    v: idx.map((i) => c.v[i]!),
    in: idx.map((i) => c.out[i]!),
    out: idx.map((i) => c.in[i]!),
  };
}

/** mm mode 1 (merge): plain contour concatenation into one multi-contour value. */
export function mergeContours(values: PathValue[]): PathValue {
  return values.flatMap((v) => v);
}

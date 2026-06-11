/**
 * 2D affine transforms as [a, b, c, d, e, f] — column-major 2x3, matching
 * CanvasRenderingContext2D.transform(a, b, c, d, e, f):
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 */

import { type Vec2 } from '@glissade/core';

export type Mat2x3 = readonly [number, number, number, number, number, number];

export const IDENTITY: Mat2x3 = [1, 0, 0, 1, 0, 0];

// normalize -0 → +0 so DisplayLists JSON-round-trip and hash stably
const z = (v: number): number => (v === 0 ? 0 : v);

export function multiply(m1: Mat2x3, m2: Mat2x3): Mat2x3 {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    z(a1 * a2 + c1 * b2),
    z(b1 * a2 + d1 * b2),
    z(a1 * c2 + c1 * d2),
    z(b1 * c2 + d1 * d2),
    z(a1 * e2 + c1 * f2 + e1),
    z(b1 * e2 + d1 * f2 + f1),
  ];
}

/** Compose translate × rotate × scale (rotation in degrees). */
export function fromTRS(position: Vec2, rotationDeg: number, scale: Vec2): Mat2x3 {
  const r = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const [sx, sy] = scale;
  return [z(cos * sx), z(sin * sx), z(-sin * sy), z(cos * sy), z(position[0]), z(position[1])];
}

export function applyToPoint(m: Mat2x3, p: Vec2): Vec2 {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

export function matEquals(a: Mat2x3, b: Mat2x3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5];
}

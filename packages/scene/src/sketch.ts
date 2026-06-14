/**
 * Hand-drawn stroke styles via GEOMETRIC roughening — not raster textures. A
 * shape's outline is flattened to polylines, then each segment is redrawn as a
 * slightly jittered, bowed stroke, overlaid in a few passes. Because it's pure
 * path math seeded by a stable per-shape seed, the result is byte-identical on
 * both backends and re-evaluates deterministically (the seed is consumed fresh
 * each draw, never as a shared stateful stream).
 */

import { random, type Rng } from '@glissade/core';
import type { PathSeg } from './displayList.js';

/** The closed set of hand-drawn looks. Mirrors FilterSpec's discipline. */
export type SketchStyle =
  | { kind: 'marker'; width?: number; roughness?: number }
  | { kind: 'crayon'; width?: number; roughness?: number; passes?: number }
  | { kind: 'pencil'; width?: number; roughness?: number; passes?: number }
  | { kind: 'ink'; width?: number; roughness?: number }
  | { kind: 'chalk'; width?: number; roughness?: number; dash?: number[] };

const KINDS = ['marker', 'crayon', 'pencil', 'ink', 'chalk'] as const;

export class SketchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SketchValidationError';
  }
}

/** Reject unknown kinds / out-of-range params at construction (like validateFilters). */
export function validateSketch(s: SketchStyle): void {
  if (!KINDS.includes(s.kind as (typeof KINDS)[number])) {
    throw new SketchValidationError(`unknown sketch kind '${String(s.kind)}' (have: ${KINDS.join(', ')})`);
  }
  if (s.width !== undefined && !(s.width > 0)) {
    throw new SketchValidationError(`sketch width must be > 0, got ${String(s.width)}`);
  }
  if (s.roughness !== undefined && !(s.roughness >= 0)) {
    throw new SketchValidationError(`sketch roughness must be ≥ 0, got ${String(s.roughness)}`);
  }
  if ((s.kind === 'crayon' || s.kind === 'pencil') && s.passes !== undefined && !(s.passes >= 1)) {
    throw new SketchValidationError(`sketch passes must be ≥ 1, got ${String(s.passes)}`);
  }
  if (s.kind === 'chalk' && s.dash !== undefined && (!Array.isArray(s.dash) || s.dash.some((d) => !(d >= 0)))) {
    throw new SketchValidationError('sketch chalk dash must be an array of non-negative numbers');
  }
}

export interface ResolvedSketch {
  width: number;
  roughness: number;
  passes: number;
  dash?: number[];
}

/** Per-kind defaults — the character of each look. */
export function resolveSketch(s: SketchStyle): ResolvedSketch {
  switch (s.kind) {
    case 'marker':
      return { width: s.width ?? 8, roughness: s.roughness ?? 1.2, passes: 2 };
    case 'crayon':
      return { width: s.width ?? 4, roughness: s.roughness ?? 2.4, passes: s.passes ?? 3 };
    case 'pencil':
      return { width: s.width ?? 1.5, roughness: s.roughness ?? 1, passes: s.passes ?? 2 };
    case 'ink':
      return { width: s.width ?? 2.5, roughness: s.roughness ?? 0.8, passes: 1 };
    case 'chalk':
      return { width: s.width ?? 3, roughness: s.roughness ?? 1.6, passes: 1, dash: s.dash ?? [6, 5] };
  }
}

export interface Polyline {
  points: [number, number][];
  closed: boolean;
}

type V2 = [number, number];
const cubic = (p0: V2, c1: V2, c2: V2, p1: V2, t: number): V2 => {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]];
};
const quad = (p0: V2, c: V2, p1: V2, t: number): V2 => {
  const mt = 1 - t;
  return [mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0], mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1]];
};
const ellipse = (cx: number, cy: number, rx: number, ry: number, rot: number, ang: number): V2 => {
  const ex = rx * Math.cos(ang);
  const ey = ry * Math.sin(ang);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return [cx + ex * cos - ey * sin, cy + ex * sin + ey * cos];
};

/**
 * Flatten a path to polylines — de Casteljau for C/Q, arc sampling for E
 * (Circle and rounded-rect corners are 'E' segments, so this MUST handle them
 * or those shapes roughen wrong). `steps` is the samples per curved segment.
 */
export function flatten(segs: readonly PathSeg[], steps = 16): Polyline[] {
  const polys: Polyline[] = [];
  let cur: Polyline | null = null;
  let px = 0;
  let py = 0;
  let sx = 0;
  let sy = 0;
  // begin a polyline at the current point if a draw command arrives without an
  // M — e.g. Circle's path is a bare 'E' arc with no leading move
  const ensure = (x: number, y: number): Polyline => {
    if (!cur) {
      cur = { points: [[x, y]], closed: false };
      polys.push(cur);
      sx = x;
      sy = y;
    }
    return cur;
  };
  for (const s of segs) {
    switch (s[0]) {
      case 'M':
        cur = { points: [[s[1], s[2]]], closed: false };
        polys.push(cur);
        px = sx = s[1];
        py = sy = s[2];
        break;
      case 'L':
        ensure(px, py).points.push([s[1], s[2]]);
        px = s[1];
        py = s[2];
        break;
      case 'C': {
        const c = ensure(px, py);
        for (let k = 1; k <= steps; k++) c.points.push(cubic([px, py], [s[1], s[2]], [s[3], s[4]], [s[5], s[6]], k / steps));
        px = s[5];
        py = s[6];
        break;
      }
      case 'Q': {
        const c = ensure(px, py);
        for (let k = 1; k <= steps; k++) c.points.push(quad([px, py], [s[1], s[2]], [s[3], s[4]], k / steps));
        px = s[3];
        py = s[4];
        break;
      }
      case 'E': {
        const [, cx, cy, rx, ry, rot, a0, a1] = s;
        const begin = ellipse(cx, cy, rx, ry, rot, a0);
        const c = ensure(begin[0], begin[1]);
        for (let k = 1; k <= steps; k++) c.points.push(ellipse(cx, cy, rx, ry, rot, a0 + (a1 - a0) * (k / steps)));
        const end = ellipse(cx, cy, rx, ry, rot, a1);
        px = end[0];
        py = end[1];
        break;
      }
      case 'Z':
        if (cur) {
          cur.points.push([sx, sy]);
          cur.closed = true;
          px = sx;
          py = sy;
        }
        break;
    }
  }
  return polys.filter((p) => p.points.length > 0);
}

/** Total length of a flattened polyline (for draw-on dashing). */
export function arcLength(poly: Polyline): number {
  let len = 0;
  for (let i = 1; i < poly.points.length; i++) {
    len += Math.hypot(poly.points[i]![0] - poly.points[i - 1]![0], poly.points[i]![1] - poly.points[i - 1]![1]);
  }
  return len;
}

/** A sketchy fill: parallel hatch lines (clipped to the shape by the caller). */
export interface HachureSpec {
  /** hatch line angle, radians */
  angleRad: number;
  /** spacing between lines, px */
  gap: number;
  /** jitter amplitude, px; default 1 */
  roughness?: number;
}

export function validateHachure(h: HachureSpec): void {
  if (!(h.gap > 0)) throw new SketchValidationError(`hachure gap must be > 0, got ${String(h.gap)}`);
  if (h.roughness !== undefined && !(h.roughness >= 0)) {
    throw new SketchValidationError(`hachure roughness must be ≥ 0, got ${String(h.roughness)}`);
  }
}

/**
 * Parallel hatch lines covering a path's bounding box at `angleRad`, spaced
 * `gap`, lightly jittered. Returned as `M/L` segments to be stroked INSIDE a
 * clip of the shape (the caller emits the clip). Pure; `rng` reseeded per draw.
 */
export function hachureLines(segs: readonly PathSeg[], spec: HachureSpec, rng: Rng): PathSeg[] {
  const polys = flatten(segs);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polys) {
    for (const [x, y] of p.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return [];
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // rotate into the hatch frame, find the rotated bbox, lay down horizontal
  // lines spaced `gap`, then rotate each line endpoint back to world space
  const ca = Math.cos(spec.angleRad);
  const sa = Math.sin(spec.angleRad);
  const toRot = (x: number, y: number): V2 => [(x - cx) * ca + (y - cy) * sa, -(x - cx) * sa + (y - cy) * ca];
  const fromRot = (x: number, y: number): V2 => [cx + x * ca - y * sa, cy + x * sa + y * ca];
  let rMinX = Infinity;
  let rMinY = Infinity;
  let rMaxX = -Infinity;
  let rMaxY = -Infinity;
  const corners: V2[] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
  for (const [x, y] of corners) {
    const [rx, ry] = toRot(x, y);
    if (rx < rMinX) rMinX = rx;
    if (ry < rMinY) rMinY = ry;
    if (rx > rMaxX) rMaxX = rx;
    if (ry > rMaxY) rMaxY = ry;
  }
  const rough = spec.roughness ?? 1;
  const jit = (): number => (rng() * 2 - 1) * rough;
  const out: PathSeg[] = [];
  for (let y = rMinY + spec.gap / 2; y < rMaxY; y += spec.gap) {
    const a = fromRot(rMinX, y + jit());
    const b = fromRot(rMaxX, y + jit());
    out.push(['M', a[0], a[1]], ['L', b[0], b[1]]);
  }
  return out;
}

/**
 * Roughen a path into hand-drawn stroke passes. Each segment becomes a bowed,
 * jittered quadratic; `passes` overlay slightly different jitters for the
 * built-up look. `rng` must be a freshly seeded generator (the caller reseeds
 * per draw from a stable seed, so evaluate() stays pure).
 */
export function roughen(
  segs: readonly PathSeg[],
  style: SketchStyle,
  rng: Rng,
): { strokes: PathSeg[][]; resolved: ResolvedSketch } {
  const resolved = resolveSketch(style);
  const polys = flatten(segs);
  const jit = (): number => (rng() * 2 - 1) * resolved.roughness;
  const strokes: PathSeg[][] = [];
  for (let pass = 0; pass < resolved.passes; pass++) {
    const out: PathSeg[] = [];
    for (const poly of polys) {
      const pts = poly.points;
      if (pts.length < 2) continue;
      let ax = pts[0]![0] + jit();
      let ay = pts[0]![1] + jit();
      out.push(['M', ax, ay]);
      for (let i = 1; i < pts.length; i++) {
        const bx = pts[i]![0] + jit();
        const by = pts[i]![1] + jit();
        // a bowed control point: nudge the midpoint perpendicular to the segment
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const bow = jit() * 0.5;
        const mx = (ax + bx) / 2 + (-dy / len) * bow;
        const my = (ay + by) / 2 + (dx / len) * bow;
        out.push(['Q', mx, my, bx, by]);
        ax = bx;
        ay = by;
      }
    }
    strokes.push(out);
  }
  return { strokes, resolved };
}

/** FNV-1a 32-bit — a stable per-shape sketch seed from its id. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Convenience: the rough stroke passes for a path at a given seed. */
export function sketchStrokes(segs: readonly PathSeg[], style: SketchStyle, seed: number): PathSeg[][] {
  return roughen(segs, style, random(seed >>> 0)).strokes;
}

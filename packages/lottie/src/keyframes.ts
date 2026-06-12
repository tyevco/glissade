/**
 * Lottie property → glissade Key[] conversion: s/e keyframe normalization,
 * the ease shift (Lottie eases live on the DEPARTING key; glissade EaseSpec
 * lives on the ARRIVING key), hold keys, frame→seconds, and the 1 ms nudge
 * for same-frame double keys.
 */

import { cubicBezier, type EaseSpec, type Key, type Vec2 } from '@glissade/core';
import type { LottieKeyframe, LottieProp } from './types.js';

/**
 * Layer-local frame time → root timeline seconds: t_sec = (t + st)/fr + offset.
 * NB: lottie-web never applies the layer time-stretch `sr` to ordinary-layer
 * properties (it is consumed only by precomp children, deferred to Stage 2);
 * the audit rejects sr ≠ 1 so this mapping stays reference-faithful.
 */
export interface TimeMap {
  fr: number;
  st: number;
  /** Root-axis shift in seconds (−ip/fr so the document starts at 0). */
  offset: number;
}

export const toSeconds = (tm: TimeMap, tFrames: number): number =>
  (tFrames + tm.st) / tm.fr + tm.offset;

export interface NormKey {
  t: number;
  value: unknown;
  /** Departing ease (this key → next), as authored. */
  o?: { x: number | number[]; y: number | number[] } | undefined;
  i?: { x: number | number[]; y: number | number[] } | undefined;
  hold: boolean;
  to?: number[] | undefined;
  ti?: number[] | undefined;
}

export const isKeyframed = (prop: LottieProp | undefined): boolean =>
  prop !== undefined &&
  Array.isArray(prop.k) &&
  prop.k.length > 0 &&
  typeof prop.k[0] === 'object' &&
  prop.k[0] !== null &&
  !Array.isArray(prop.k[0]) &&
  't' in (prop.k[0] as object);

/** Resolve old-format s/e pairs (value at key j = s_j, falling back to e_{j-1}). */
export function normalizeKeys(raw: LottieKeyframe[]): NormKey[] {
  const out: NormKey[] = [];
  for (let j = 0; j < raw.length; j++) {
    const k = raw[j]!;
    const prev = raw[j - 1];
    const value = k.s ?? prev?.e ?? prev?.s;
    out.push({
      t: k.t,
      value,
      o: k.o ?? undefined,
      i: k.i ?? undefined,
      hold: k.h === 1,
      to: k.to ?? undefined,
      ti: k.ti ?? undefined,
    });
  }
  return out;
}

const handleAt = (h: number | number[] | undefined, dim: number, fallback: number): number => {
  if (h === undefined) return fallback;
  if (Array.isArray(h)) return h[Math.min(dim, h.length - 1)] ?? fallback;
  return h;
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * EaseSpec of the segment DEPARTING `from` (lands on the glissade arrival
 * key). x handles are clamped to [0,1] (the time axis); y stays unclamped
 * (overshoot is lossless). x≈y on both handles is the identity curve →
 * undefined (linear).
 */
export function departingEase(from: NormKey, dim = 0): EaseSpec | undefined {
  if (!from.o || !from.i) return undefined;
  const x1 = clamp01(handleAt(from.o.x, dim, 0));
  const y1 = handleAt(from.o.y, dim, 0);
  const x2 = clamp01(handleAt(from.i.x, dim, 1));
  const y2 = handleAt(from.i.y, dim, 1);
  if (Math.abs(x1 - y1) < 1e-9 && Math.abs(x2 - y2) < 1e-9) return undefined;
  return { kind: 'cubicBezier', pts: [x1, y1, x2, y2] };
}

/** Per-dimension eases differ → vec2 tracks must split to component tracks. */
export function easesDifferPerDim(norm: NormKey[], dims: number): boolean {
  for (const k of norm) {
    for (const h of [k.o, k.i]) {
      if (!h) continue;
      for (const axis of [h.x, h.y]) {
        if (!Array.isArray(axis) || axis.length < 2) continue;
        const first = axis[0]!;
        for (let d = 1; d < Math.min(dims, axis.length); d++) {
          if (Math.abs(axis[d]! - first) > 1e-9) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Same-frame double keys (and any non-increasing t after rounding): nudge the
 * later key 1 ms forward and make it a hold arrival, so the jump is preserved
 * without violating validateTrack's strict ordering.
 */
export function enforceMonotonic<T>(keys: Key<T>[]): Key<T>[] {
  for (let j = 1; j < keys.length; j++) {
    const prev = keys[j - 1]!;
    const cur = keys[j]!;
    if (cur.t <= prev.t) {
      cur.t = prev.t + 0.001;
      cur.interp = 'hold';
      delete cur.ease;
    }
  }
  return keys;
}

/**
 * Generic ease-shifted conversion: glissade key j carries the ease/hold of
 * Lottie key j−1's departing segment.
 */
export function convertKeys<T>(
  norm: NormKey[],
  tm: TimeMap,
  map: (value: unknown, normKey: NormKey) => T,
  dim = 0,
): Key<T>[] {
  const out: Key<T>[] = [];
  for (let j = 0; j < norm.length; j++) {
    const n = norm[j]!;
    const k: Key<T> = { t: toSeconds(tm, n.t), value: map(n.value, n) };
    if (j > 0) {
      const from = norm[j - 1]!;
      if (from.hold) k.interp = 'hold';
      else {
        const ease = departingEase(from, dim);
        if (ease !== undefined) k.ease = ease;
      }
    }
    out.push(k);
  }
  return enforceMonotonic(out);
}

export const scalarOf = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0];
  throw new TypeError(`expected a Lottie scalar, got ${JSON.stringify(v)}`);
};

export const vec2Of = (v: unknown): Vec2 => {
  if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number') {
    return [v[0], v[1]];
  }
  throw new TypeError(`expected a Lottie vector, got ${JSON.stringify(v)}`);
};

/** Static (non-keyframed) value of a property, or undefined when keyframed. */
export function staticValue(prop: LottieProp | undefined): unknown {
  if (prop === undefined || isKeyframed(prop)) return undefined;
  return prop.k;
}

const SPATIAL_EPS = 1e-9;

const hasSpatialTangent = (k: NormKey): boolean => {
  for (const t of [k.to, k.ti]) {
    if (t && (Math.abs(t[0] ?? 0) > SPATIAL_EPS || Math.abs(t[1] ?? 0) > SPATIAL_EPS)) return true;
  }
  return false;
};

interface ArcTable {
  us: number[];
  lens: number[];
  total: number;
}

const cubicPoint = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 => {
  const w = 1 - u;
  const a = w * w * w;
  const b = 3 * w * w * u;
  const c = 3 * w * u * u;
  const d = u * u * u;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
};

function arcLengthTable(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, samples = 128): ArcTable {
  const us = [0];
  const lens = [0];
  let prev = p0;
  let acc = 0;
  for (let s = 1; s <= samples; s++) {
    const u = s / samples;
    const pt = cubicPoint(p0, p1, p2, p3, u);
    acc += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    us.push(u);
    lens.push(acc);
    prev = pt;
  }
  return { us, lens, total: acc };
}

function uAtLength(table: ArcTable, target: number): number {
  const { us, lens } = table;
  if (target <= 0) return 0;
  if (target >= table.total) return 1;
  let lo = 0;
  let hi = lens.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (lens[mid]! <= target) lo = mid;
    else hi = mid;
  }
  const span = lens[hi]! - lens[lo]!;
  const f = span > 0 ? (target - lens[lo]!) / span : 0;
  return us[lo]! + f * (us[hi]! - us[lo]!);
}

/**
 * Position keys with spatial ti/to: segments with tangents are BAKED to dense
 * keys at the document fps by arc-length parameterization — Lottie maps the
 * temporal ease onto distance along the curve, not the bezier parameter, so
 * a parameter-space lerp would diverge mid-segment. Plain segments convert
 * directly with their cubicBezier eases.
 */
export function convertPositionKeys(norm: NormKey[], tm: TimeMap, docFr: number): Key<Vec2>[] {
  const out: Key<Vec2>[] = [];
  for (let j = 0; j < norm.length; j++) {
    const n = norm[j]!;
    const value = vec2Of(n.value);
    const t = toSeconds(tm, n.t);
    const from = norm[j - 1];
    if (j === 0 || from!.hold || !hasSpatialTangent(from!)) {
      const k: Key<Vec2> = { t, value };
      if (j > 0) {
        if (from!.hold) k.interp = 'hold';
        else {
          const ease = departingEase(from!, 0);
          if (ease !== undefined) k.ease = ease;
        }
      }
      out.push(k);
      continue;
    }
    // bake (prev → this): dense linear keys at the document frame grid
    const p0 = vec2Of(from!.value);
    const p3 = value;
    const p1: Vec2 = [p0[0] + (from!.to?.[0] ?? 0), p0[1] + (from!.to?.[1] ?? 0)];
    const p2: Vec2 = [p3[0] + (from!.ti?.[0] ?? 0), p3[1] + (from!.ti?.[1] ?? 0)];
    const table = arcLengthTable(p0, p1, p2, p3);
    const easeSpec = departingEase(from!, 0);
    const easeFn =
      easeSpec !== undefined && typeof easeSpec === 'object' && easeSpec.kind === 'cubicBezier'
        ? cubicBezier(...easeSpec.pts)
        : (u: number) => u;
    const t0 = out[out.length - 1]!.t;
    const step = 1 / docFr;
    // integer-multiple times keep baked keys on the exact document frame grid
    for (let s = 1; t0 + s * step < t - step / 2; s++) {
      const bt = t0 + s * step;
      const p = (bt - t0) / (t - t0);
      const u = uAtLength(table, easeFn(p) * table.total);
      out.push({ t: bt, value: cubicPoint(p0, p1, p2, p3, u) });
    }
    out.push({ t, value });
  }
  return enforceMonotonic(out);
}

/**
 * Value-type registry with pluggable per-type interpolation (DESIGN.md §2.2).
 * `extrapolates` declares whether a type's lerp accepts easedT outside [0,1]
 * (spring overshoot); non-extrapolating types clamp.
 */

import { lerpColor, parseColor } from './color.js';
import { emitDevWarning } from './devWarning.js';

export type Vec2 = readonly [number, number];

/** One bezier contour in Lottie's vertex form: anchor points + RELATIVE in/out tangents. */
export interface PathContour {
  closed: boolean;
  v: Vec2[];
  in: Vec2[];
  out: Vec2[];
}

/** The 'path' document value (§2.2): plain JSON, serializes with no new hooks. */
export type PathValue = PathContour[];

/** Transition handoff policies (v2 addendum §A.4/§B.1); 'crossfade' reserved. */
export type HandoffKind = 'cut' | 'decay' | 'spring' | 'blend-from-frozen';

export interface ValueType<T> {
  id: string;
  lerp(a: T, b: T, t: number): T;
  /** Accepts easedT outside [0,1] (spring overshoot)? Otherwise clamped. */
  extrapolates: boolean;
  equals(a: T, b: T): boolean;
  /** Optional linear-space operators (offset decay + reserved additive blending, §B.6). */
  add?(a: T, b: T): T;
  sub?(a: T, b: T): T;
  scale?(a: T, k: number): T;
  /** Type-class handoff default (§B.1): spring for kinetic, cut for hold-only. */
  defaultHandoff?: HandoffKind;
  /** Document (de)serialization; default identity for JSON-native types (§2.2). */
  serialize?(value: T): unknown;
  deserialize?(raw: unknown): T;
}

export type ValueTypeId = 'number' | 'vec2' | 'color' | 'string' | 'boolean' | (string & {});

const registry = new Map<string, ValueType<never>>();

export function registerValueType<T>(vt: ValueType<T>): void {
  registry.set(vt.id, vt as ValueType<never>);
}

export class UnknownValueTypeError extends Error {
  constructor(id: string) {
    super(`unknown value type '${id}'; register it via registerValueType()`);
    this.name = 'UnknownValueTypeError';
  }
}

export function getValueType<T = unknown>(id: ValueTypeId): ValueType<T> {
  const vt = registry.get(id);
  if (!vt) throw new UnknownValueTypeError(id);
  return vt as ValueType<T>;
}

export const numberType: ValueType<number> = {
  id: 'number',
  lerp: (a, b, t) => a + (b - a) * t,
  extrapolates: true,
  equals: Object.is,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  scale: (a, k) => a * k,
  defaultHandoff: 'spring',
};

export const vec2Equals = (a: Vec2, b: Vec2): boolean => a[0] === b[0] && a[1] === b[1];

export const vec2Type: ValueType<Vec2> = {
  id: 'vec2',
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
  extrapolates: true,
  equals: vec2Equals,
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  scale: (a, k) => [a[0] * k, a[1] * k],
  defaultHandoff: 'spring',
};

/** vec2 swept along a circular arc: polar lerp of radius + shortest-path angle (§2.2). */
export const vec2ArcType: ValueType<Vec2> = {
  id: 'vec2-arc',
  lerp: (a, b, t) => {
    const ra = Math.hypot(a[0], a[1]);
    const rb = Math.hypot(b[0], b[1]);
    const angA = Math.atan2(a[1], a[0]);
    let dAng = Math.atan2(b[1], b[0]) - angA;
    while (dAng > Math.PI) dAng -= 2 * Math.PI;
    while (dAng < -Math.PI) dAng += 2 * Math.PI;
    const r = ra + (rb - ra) * t;
    const ang = angA + dAng * t;
    return [r * Math.cos(ang), r * Math.sin(ang)];
  },
  extrapolates: true,
  equals: vec2Equals,
  defaultHandoff: 'blend-from-frozen', // nonlinear: no linear offset for the spring handoff
};

export const colorType: ValueType<string> = {
  id: 'color',
  lerp: lerpColor,
  extrapolates: true,
  equals: (a, b) => a === b,
  // no add/sub/scale: color strings cannot carry negative OKLab offsets, so
  // color is the canonical lerp-only type — snapshot blend, never offsets
  defaultHandoff: 'blend-from-frozen',
};

/** Discrete types: hold-only by construction (§2.2); lerp snaps at t=1. */
function discrete<T>(id: string): ValueType<T> {
  return {
    id,
    lerp: (a, b, t) => (t >= 1 ? b : a),
    extrapolates: false,
    equals: (a, b) => Object.is(a, b),
    defaultHandoff: 'cut',
  };
}

export const stringType = discrete<string>('string');
export const booleanType = discrete<boolean>('boolean');

const lerpV = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Topology must match for a morph (contour count, closed flags, vertex counts). */
function pathTopologyMatches(a: PathValue, b: PathValue): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ca = a[i]!;
    const cb = b[i]!;
    if (ca.closed !== cb.closed || ca.v.length !== cb.v.length) return false;
  }
  return true;
}

let warnedPathTopology = false;

/**
 * Path morphing (§2.2): pairwise lerp of anchors and tangents — exactly how
 * lottie-web morphs, so imported animations are pixel-faithful. Mismatched
 * topology snaps (hold a, then b at t ≥ 1) with a one-time dev warning; the
 * de Casteljau normalization fallback for arbitrary native morphs is tracked
 * future work. Lerp-only: offsets are not well-defined under mismatched
 * topology, so no add/sub/scale — handoffs blend from the frozen value.
 */
export const pathType: ValueType<PathValue> = {
  id: 'path',
  lerp: (a, b, t) => {
    if (!pathTopologyMatches(a, b)) {
      if (!warnedPathTopology) {
        warnedPathTopology = true;
        emitDevWarning(
          'path lerp with mismatched topology (contour/vertex counts or closed flags differ): ' +
            'snapping instead of morphing — supply matched vertex counts (§2.2)',
        );
      }
      return t >= 1 ? b : a;
    }
    return a.map((ca, i) => {
      const cb = b[i]!;
      return {
        closed: ca.closed,
        v: ca.v.map((p, j) => lerpV(p, cb.v[j]!, t)),
        in: ca.in.map((p, j) => lerpV(p, cb.in[j]!, t)),
        out: ca.out.map((p, j) => lerpV(p, cb.out[j]!, t)),
      };
    });
  },
  extrapolates: false, // springs clamp with the generic dev warning (§2.7)
  equals: (a, b) => {
    if (a === b) return true;
    if (!pathTopologyMatches(a, b)) return false;
    const eq = (x: Vec2, y: Vec2) => x[0] === y[0] && x[1] === y[1];
    return a.every((ca, i) => {
      const cb = b[i]!;
      return ca.v.every((p, j) => eq(p, cb.v[j]!)) && ca.in.every((p, j) => eq(p, cb.in[j]!)) && ca.out.every((p, j) => eq(p, cb.out[j]!));
    });
  },
  defaultHandoff: 'blend-from-frozen',
};

export class ValueTypeInferenceError extends Error {
  constructor(value: unknown) {
    super(`cannot infer a value type for ${JSON.stringify(value)}; register a custom type`);
    this.name = 'ValueTypeInferenceError';
  }
}

const isContour = (c: unknown): c is PathContour =>
  typeof c === 'object' && c !== null &&
  typeof (c as PathContour).closed === 'boolean' &&
  Array.isArray((c as PathContour).v) && Array.isArray((c as PathContour).in) && Array.isArray((c as PathContour).out);

/** Infer a registered type id from a sample value (builder + bake authoring surfaces). */
export function inferValueType(value: unknown): ValueTypeId {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number')) {
    return 'vec2';
  }
  if (Array.isArray(value) && value.length > 0 && value.every(isContour)) {
    return 'path';
  }
  if (typeof value === 'string') {
    try {
      parseColor(value);
      return 'color';
    } catch {
      return 'string';
    }
  }
  throw new ValueTypeInferenceError(value);
}

registerValueType(numberType);
registerValueType(vec2Type);
registerValueType(vec2ArcType);
registerValueType(colorType);
registerValueType(stringType);
registerValueType(booleanType);
registerValueType(pathType);

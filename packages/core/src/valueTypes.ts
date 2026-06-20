/**
 * Value-type registry with pluggable per-type interpolation (DESIGN.md §2.2).
 * `extrapolates` declares whether a type's lerp accepts easedT outside [0,1]
 * (spring overshoot); non-extrapolating types clamp.
 */

import { formatColor, lerpColor, parseColor } from './color.js';
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
  /**
   * The built-in value type this type is REPRESENTATIONALLY compatible with —
   * the bind guard (binding.ts) matches a track to a target when their reprs
   * agree, not just their ids. A custom type that is "a number under a different
   * id" (e.g. a `cents` type) sets `repr: 'number'` so it binds to `number`
   * props (and vice versa); `vec2-arc` sets `repr: 'vec2'`. SINGLE-HOP only:
   * `repr` must name a base type that has no `repr` of its own (no chaining).
   * Omitted ⇒ the type is its own repr.
   */
  repr?: ValueTypeId;
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

/**
 * Resolve a value-type id to its REPRESENTATION (the bind guard's compatibility
 * key, §2.2): a type's `repr` (the built-in it's representationally compatible
 * with), else the id itself. SINGLE-HOP — `repr` is never chained, so a custom
 * type's repr must be a base type. An UNREGISTERED id resolves to itself (the
 * guard's job is repr-compat, not existence — `getValueType` enforces that).
 */
export function reprOf(id: ValueTypeId): ValueTypeId {
  return registry.get(id)?.repr ?? id;
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
  repr: 'vec2', // representationally a Vec2 — binds to plain `vec2` props (binding.ts)
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

/** A gradient color stop: `offset` 0..1 along the gradient, `color` a CSS string. */
export interface ColorStop {
  offset: number;
  color: string;
}

/**
 * How a gradient blends BETWEEN its stops: `linear` (the canvas-native ramp,
 * the default — byte-identical to no mode), `smooth` (a smoothstep S-curve, no
 * Mach-banding at stops), or `gaussian` (a soft gaussian shoulder — melts like
 * a wide blur with 2-3 stops). `smooth`/`gaussian` densify + oklab-interpolate
 * the stops at raster, so a soft-light fill reads as smooth as a blur, no filter.
 */
export type GradientInterpolation = 'linear' | 'smooth' | 'gaussian';

/** One mesh-gradient color point: `pos` in normalized [0,1]² fill space, `color`
 * a CSS string. Both are ANIMATABLE (e.g. `track('node/fill.points.0.color', …)`
 * drives aurora drift on one node). */
export interface MeshPoint {
  pos: [number, number];
  color: string;
}

/**
 * How a `mesh` Paint blends its scattered color points: `smooth` (Shepard
 * inverse-distance weighting in OKLab — sharper points), `gaussian` (a pinned-
 * sigma gaussian melt — a softer, blurrier aurora), or `oklab` (an alias for
 * `smooth`; the blend space is always OKLab). NO triangulator — one shared
 * deterministic kernel both backends run (§3 Paint).
 */
export type MeshInterpolation = 'smooth' | 'gaussian' | 'oklab';

/** A native mesh-gradient fill: N color points blended across the [0,1]² fill
 * rectangle as ONE animatable fill (replaces the "N blurred blobs" aurora). */
export interface MeshPaint {
  kind: 'mesh';
  points: MeshPoint[];
  interpolation?: MeshInterpolation;
  /** Optional baseline color (a zero-weight floor) so a sparse mesh doesn't smear
   * one point across the whole rect; omit for a pure points-only blend. */
  bg?: string;
}

/**
 * A fill/stroke paint (§2.2 animatable document value): a solid color, a
 * `linear`/`radial` gradient, or a `mesh` gradient. Geometry (`from`/`to`,
 * `center`/`radius`, mesh `pos`) is in the shape's LOCAL space; omit gradient
 * geometry to default to the filled path's bounds. Plain JSON — serializes with
 * no hooks; animatable via `paintType`.
 */
export type Paint =
  | { kind: 'color'; color: string }
  | { kind: 'linear'; stops: ColorStop[]; from?: [number, number]; to?: [number, number]; interpolation?: GradientInterpolation }
  | { kind: 'radial'; stops: ColorStop[]; center?: [number, number]; radius?: number; interpolation?: GradientInterpolation }
  | MeshPaint;

const lerpN = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpPt = (a: [number, number], b: [number, number], t: number): [number, number] => [lerpN(a[0], b[0], t), lerpN(a[1], b[1], t)];

/** Same hue at alpha 0 — a transparent stand-in so an appearing/disappearing
 * `bg` (mesh baseline) fades through alpha instead of popping at the boundary.
 * `parseColor` THROWS on a non-hex/non-canonical CSS color (hsl/named/oklch);
 * since this runs inside `lerp` during evaluate() it must NEVER throw — fall
 * back to holding the PRESENT color so the bg snaps in/out instead of crashing
 * the whole frame. */
function transparentOf(color: string): string {
  try {
    return formatColor({ ...parseColor(color), a: 0 });
  } catch {
    return color;
  }
}

/** `lerpColor` that NEVER throws inside `lerp` (evaluate()): on an unparseable
 * color (hsl/named/oklch — `parseColor` only knows hex/rgb) it SNAPS (holds `a`,
 * then `b` at t≥1) instead of crashing the frame. Byte-identical to `lerpColor`
 * for parseable colors, so it does not move any golden. */
function safeLerpColor(a: string, b: string, t: number): string {
  try {
    return lerpColor(a, b, t);
  } catch {
    return t >= 1 ? b : a;
  }
}

/** Lift a solid color to a uniform gradient matching `shape` (every stop = color),
 * so a color↔gradient tween fades smoothly instead of snapping. */
function liftColor(color: string, shape: Extract<Paint, { kind: 'linear' | 'radial' }>): Extract<Paint, { kind: 'linear' | 'radial' }> {
  const stops = shape.stops.map((s) => ({ offset: s.offset, color }));
  const interp = shape.interpolation ? { interpolation: shape.interpolation } : {};
  return shape.kind === 'radial'
    ? { kind: 'radial', stops, ...(shape.center ? { center: shape.center } : {}), ...(shape.radius !== undefined ? { radius: shape.radius } : {}), ...interp }
    : { kind: 'linear', stops, ...(shape.from ? { from: shape.from } : {}), ...(shape.to ? { to: shape.to } : {}), ...interp };
}

let warnedPaintShape = false;
function paintSnap<T>(
  t: number,
  a: T,
  b: T,
  message = 'paint lerp across mismatched gradient shapes (different kind or stop count): snapping ' +
    'instead of interpolating — match the kind + stop count on both keyframes (§2.2)',
): T {
  if (!warnedPaintShape) {
    warnedPaintShape = true;
    emitDevWarning(message);
  }
  return t >= 1 ? b : a;
}

const stopsEqual = (a: ColorStop[], b: ColorStop[]): boolean =>
  a.length === b.length && a.every((s, i) => s.offset === b[i]!.offset && s.color === b[i]!.color);

/**
 * Gradient paint morphing (§2.2): a solid color lifts to a uniform gradient to
 * meet the other side, then matched-kind/matched-stop-count gradients lerp their
 * stops (offset + oklab color) and geometry pairwise; a mismatched kind or stop
 * count snaps (hold a, then b at t ≥ 1) with a one-time dev warning. Lerp-only —
 * no offsets under mismatch — so handoffs blend from the frozen value.
 */
export const paintType: ValueType<Paint> = {
  id: 'paint',
  lerp: (a, b, t) => {
    if (a.kind === 'color' && b.kind === 'color') return { kind: 'color', color: lerpColor(a.color, b.color, t) };
    // mesh↔mesh with MATCHED point count: lerp each point's pos + oklab color.
    // The interpolation MODE is a discrete kernel switch (meshGradient forks on
    // it), so a mode mismatch snaps via paintSnap — the kernel flips exactly once
    // at the boundary instead of rasterizing the whole tween with A's kernel then
    // popping. `bg` (the mesh baseline) fades through a transparent stand-in when
    // it appears/disappears, so it ramps symmetrically rather than popping at t≥1.
    // Mismatched point count (or cross-kind: solid→uniform-mesh lift is deferred)
    // also snaps via paintSnap.
    if (a.kind === 'mesh' && b.kind === 'mesh') {
      if (a.points.length !== b.points.length) return paintSnap(t, a, b);
      if (a.interpolation !== b.interpolation) {
        return paintSnap(
          t,
          a,
          b,
          'paint lerp across mismatched mesh interpolation modes ' +
            `('${a.interpolation ?? 'smooth'}' → '${b.interpolation ?? 'smooth'}'): snapping instead of ` +
            'interpolating — the blend kernel is discrete, so it switches once at the boundary; ' +
            'match `interpolation` on both keyframes to morph the points (§3 Paint)',
        );
      }
      const points = a.points.map((pa, i) => {
        const pb = b.points[i]!;
        return { pos: lerpPt(pa.pos, pb.pos, t), color: lerpColor(pa.color, pb.color, t) };
      });
      // bg fades symmetrically: lift the missing side to a transparent stand-in
      // of the present color, then always lerp when EITHER side has a bg.
      const bg =
        a.bg !== undefined || b.bg !== undefined
          ? { bg: safeLerpColor(a.bg ?? transparentOf(b.bg!), b.bg ?? transparentOf(a.bg!), t) }
          : {};
      return {
        kind: 'mesh',
        points,
        ...(a.interpolation ? { interpolation: a.interpolation } : {}),
        ...bg,
      };
    }
    if (a.kind === 'mesh' || b.kind === 'mesh') return paintSnap(t, a, b);
    // a, b are now color | linear | radial (mesh handled/snapped above)
    let A: Exclude<Paint, MeshPaint> = a;
    let B: Exclude<Paint, MeshPaint> = b;
    if (A.kind === 'color' && B.kind !== 'color') A = liftColor(A.color, B);
    else if (B.kind === 'color' && A.kind !== 'color') B = liftColor(B.color, A);
    if (A.kind === 'color' || B.kind === 'color' || A.kind !== B.kind || A.stops.length !== B.stops.length) {
      return paintSnap(t, a, b);
    }
    const stops = A.stops.map((sa, i) => ({ offset: lerpN(sa.offset, B.stops[i]!.offset, t), color: lerpColor(sa.color, B.stops[i]!.color, t) }));
    const interp = A.interpolation ? { interpolation: A.interpolation } : {}; // mode is discrete metadata — carry A's
    if (A.kind === 'radial' && B.kind === 'radial') {
      return {
        kind: 'radial',
        stops,
        ...(A.center && B.center ? { center: lerpPt(A.center, B.center, t) } : A.center ? { center: A.center } : {}),
        ...(A.radius !== undefined && B.radius !== undefined ? { radius: lerpN(A.radius, B.radius, t) } : A.radius !== undefined ? { radius: A.radius } : {}),
        ...interp,
      };
    }
    if (A.kind === 'linear' && B.kind === 'linear') {
      return {
        kind: 'linear',
        stops,
        ...(A.from && B.from ? { from: lerpPt(A.from, B.from, t) } : A.from ? { from: A.from } : {}),
        ...(A.to && B.to ? { to: lerpPt(A.to, B.to, t) } : A.to ? { to: A.to } : {}),
        ...interp,
      };
    }
    return paintSnap(t, a, b);
  },
  extrapolates: false, // gradients clamp; spring overshoot on stops/geometry isn't meaningful
  equals: (a, b) => {
    if (a === b) return true;
    if (a.kind !== b.kind) return false;
    if (a.kind === 'color') return b.kind === 'color' && a.color === b.color;
    if (a.kind === 'mesh') {
      if (b.kind !== 'mesh') return false;
      if (a.interpolation !== b.interpolation || a.bg !== b.bg) return false;
      if (a.points.length !== b.points.length) return false;
      return a.points.every((p, i) => {
        const q = b.points[i]!;
        return p.color === q.color && p.pos[0] === q.pos[0] && p.pos[1] === q.pos[1];
      });
    }
    if (b.kind === 'color' || b.kind === 'mesh') return false;
    if (!stopsEqual(a.stops, b.stops)) return false;
    if (a.interpolation !== b.interpolation) return false;
    if (a.kind === 'radial' && b.kind === 'radial') {
      return JSON.stringify(a.center) === JSON.stringify(b.center) && a.radius === b.radius;
    }
    if (a.kind === 'linear' && b.kind === 'linear') {
      return JSON.stringify(a.from) === JSON.stringify(b.from) && JSON.stringify(a.to) === JSON.stringify(b.to);
    }
    return false;
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

const isPaint = (v: unknown): v is Paint =>
  typeof v === 'object' && v !== null &&
  ((v as Paint).kind === 'color' || (v as Paint).kind === 'linear' || (v as Paint).kind === 'radial' || (v as Paint).kind === 'mesh');

/** Infer a registered type id from a sample value (builder + bake authoring surfaces). */
export function inferValueType(value: unknown): ValueTypeId {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  // a Paint OBJECT (gradient or {kind:'color'}) is the animatable paint type;
  // a bare color STRING stays the 'color' (string) type below
  if (isPaint(value)) return 'paint';
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
registerValueType(paintType);

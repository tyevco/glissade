/**
 * Track & keyframe model (DESIGN.md §2.2) and sampling (§2.4): binary search
 * per track with a last-segment cursor — sanctioned memoization, semantics
 * identical to a cold search (property-tested).
 */

import {
  cubicBezier,
  cubicBezierDerivative,
  easingDerivatives,
  namedEasing,
  type EaseSpec,
  type EasingFn,
} from './easing.js';
import { springEasing, springEasingDerivative } from './spring.js';
import { emitDevWarning } from './devWarning.js';
import { getValueType, type ValueTypeId } from './valueTypes.js';

export interface Key<T = unknown> {
  t: number;
  value: T;
  /** Shape of the segment ARRIVING at this key (from the previous key). */
  ease?: EaseSpec;
  interp?: 'default' | 'hold';
  /** Stable key id (studio-assigned); optional in code-authored documents. */
  id?: string;
  /** Builder-resolved implicit from-value; re-resolved on merge (§2.6, §6.2). */
  derived?: boolean;
}

export interface Track<T = unknown> {
  /** Canonical path: '<nodeId>/<prop.path>', e.g. 'circle/position.x'. */
  target: string;
  type: ValueTypeId;
  /** Sorted by t; enforced by validateTrack(). */
  keys: Key<T>[];
  /** Studio may own this track's keys via sidecar (§6.2). */
  editable?: boolean;
}

export class TrackValidationError extends Error {
  constructor(target: string, message: string) {
    super(`track '${target}': ${message}`);
    this.name = 'TrackValidationError';
  }
}

export function validateTrack(track: Track): void {
  getValueType(track.type); // throws on unknown type
  if (track.keys.length === 0) {
    throw new TrackValidationError(track.target, 'must have at least one key');
  }
  for (let i = 1; i < track.keys.length; i++) {
    const prev = track.keys[i - 1]!;
    const cur = track.keys[i]!;
    if (cur.t <= prev.t) {
      throw new TrackValidationError(
        track.target,
        `keys must be strictly increasing in t (key[${i}] at t=${cur.t} after t=${prev.t})`,
      );
    }
  }
  if (!/^[^/]+\/.+$/.test(track.target)) {
    throw new TrackValidationError(
      track.target,
      "target must be '<nodeId>/<prop.path>' (e.g. 'circle/opacity')",
    );
  }
}

// --- authoring helpers (§2.6 raw surface) ---

export type KeyOpts<T> = Partial<Omit<Key<T>, 't' | 'value'>>;

export function key<T>(t: number, value: T, easeOrOpts?: EaseSpec | KeyOpts<T>): Key<T> {
  if (easeOrOpts === undefined) return { t, value };
  if (typeof easeOrOpts === 'string' || 'kind' in (easeOrOpts as object)) {
    return { t, value, ease: easeOrOpts as EaseSpec };
  }
  const opts = easeOrOpts as KeyOpts<T>;
  const k: Key<T> = { t, value };
  if (opts.ease !== undefined) k.ease = opts.ease;
  if (opts.interp !== undefined) k.interp = opts.interp;
  if (opts.id !== undefined) k.id = opts.id;
  if (opts.derived !== undefined) k.derived = opts.derived;
  return k;
}

export function track<T>(
  target: string,
  type: ValueTypeId,
  keys: Key<T>[],
  opts?: { editable?: boolean },
): Track<T> {
  const tr: Track<T> = { target, type, keys };
  if (opts?.editable !== undefined) tr.editable = opts.editable;
  validateTrack(tr as Track);
  return tr;
}

// --- sampling ---

export function resolveEase(spec: EaseSpec | undefined): EasingFn {
  if (spec === undefined) return namedEasing('linear');
  if (typeof spec === 'string') return namedEasing(spec);
  if (spec.kind === 'cubicBezier') return cubicBezier(...spec.pts);
  return springEasing(spec);
}

const warnedNumericDerivative = new Set<string>();

/**
 * Analytic d(u) for an ease spec (§B.6). Custom-registered eases without a
 * derivative fall back to a symmetric difference with a one-time dev warning.
 */
export function resolveEaseDerivative(spec: EaseSpec | undefined): EasingFn {
  if (spec === undefined) return easingDerivatives['linear']!;
  if (typeof spec === 'string') {
    const d = easingDerivatives[spec];
    if (d) return d;
    const fn = namedEasing(spec); // throws on unknown names, same as resolveEase
    if (!warnedNumericDerivative.has(spec)) {
      warnedNumericDerivative.add(spec);
      emitDevWarning(
        `easing '${spec}' has no registered derivative; velocity uses a numeric fallback — ` +
          'register one in easingDerivatives for exact interruption handoff',
      );
    }
    const h = 1e-5;
    return (u) => (fn(Math.min(1, u + h)) - fn(Math.max(0, u - h))) / (Math.min(1, u + h) - Math.max(0, u - h));
  }
  if (spec.kind === 'cubicBezier') return cubicBezierDerivative(...spec.pts);
  return springEasingDerivative(spec);
}

interface SamplerState {
  /** Index of the segment's arrival key last used; hint only. */
  cursor: number;
  easeCache: (EasingFn | undefined)[];
}

const samplerStates = new WeakMap<Track, SamplerState>();

function state(tr: Track): SamplerState {
  let s = samplerStates.get(tr);
  if (!s) {
    s = { cursor: 1, easeCache: new Array<EasingFn | undefined>(tr.keys.length) };
    samplerStates.set(tr, s);
  }
  return s;
}

function easeFor(tr: Track, s: SamplerState, i: number): EasingFn {
  let fn = s.easeCache[i];
  if (!fn) {
    fn = resolveEase(tr.keys[i]!.ease);
    s.easeCache[i] = fn;
  }
  return fn;
}

/**
 * Find i such that keys[i-1].t <= t < keys[i].t, i.e. the index of the
 * arrival key of the segment containing t. Returns 0 if t < first key,
 * keys.length if t >= last key.
 */
function findSegment(keys: Key[], t: number, hint: number): number {
  const n = keys.length;
  // cursor fast paths: same segment, or the immediate neighbors (monotonic playback)
  for (let i = Math.max(1, hint - 1); i <= Math.min(n - 1, hint + 1); i++) {
    if (keys[i - 1]!.t <= t && t < keys[i]!.t) return i;
  }
  if (t < keys[0]!.t) return 0;
  if (t >= keys[n - 1]!.t) return n;
  let lo = 1;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid]!.t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Analytic track derivative at time t, in value-units per second of local
 * track time (v2 addendum §B.3/§B.6 conventions, pinned):
 * (a) at a key boundary, velocity is the RIGHT derivative;
 * (b) hold segments and the clamped regions outside the keys have v = 0;
 * (c) types without sub/scale operators return null (no kinetic velocity).
 */
export function velocityAt<T>(tr: Track<T>, t: number): T | null {
  const vt = getValueType<T>(tr.type);
  if (!vt.sub || !vt.scale) return null;
  const keys = tr.keys as Key<T>[];
  const n = keys.length;
  const s = state(tr as Track);
  const i = findSegment(keys as Key[], t, s.cursor);
  const zero = vt.scale(vt.sub(keys[0]!.value, keys[0]!.value), 0);
  if (i === 0 || i >= n) return zero; // clamped regions
  const arrival = keys[i]!;
  if (arrival.interp === 'hold') return zero;
  const prev = keys[i - 1]!;
  const segDur = arrival.t - prev.t;
  const p = (t - prev.t) / segDur;
  if (!vt.extrapolates) {
    const eased = easeFor(tr as Track, s, i)(p);
    if (eased < 0 || eased > 1) return zero; // clamped value is locally constant
  }
  const d = resolveEaseDerivative(arrival.ease)(p);
  return vt.scale(vt.sub(arrival.value, prev.value), d / segDur);
}

/** Pure sample of a track at time t (§2.4). */
export function sampleTrack<T>(tr: Track<T>, t: number): T {
  const keys = tr.keys as Key<T>[];
  const n = keys.length;
  const s = state(tr as Track);
  const i = findSegment(keys as Key[], t, s.cursor);
  if (i === 0) return keys[0]!.value;
  if (i >= n) return keys[n - 1]!.value;
  s.cursor = i;
  const arrival = keys[i]!;
  const prev = keys[i - 1]!;
  // hold: previous value until this key's t (we are strictly before it here)
  if (arrival.interp === 'hold') return prev.value;
  const vt = getValueType<T>(tr.type);
  const p = (t - prev.t) / (arrival.t - prev.t);
  let easedT = easeFor(tr as Track, s, i)(p);
  if (!vt.extrapolates) easedT = Math.min(1, Math.max(0, easedT));
  return vt.lerp(prev.value, arrival.value, easedT);
}

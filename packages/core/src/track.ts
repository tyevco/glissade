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
import { spring as springFactory, springEasing, springEasingDerivative, type SpringConfig } from './spring.js';
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
  /** Reserved (§4.7): a v2 synthesized-transition leading key reads the live value. v1 accepts but ignores it. */
  from?: 'live';
}

export interface Track<T = unknown> {
  /** Canonical path: '<nodeId>/<prop.path>', e.g. 'circle/position.x'. */
  target: string;
  type: ValueTypeId;
  /** Sorted by t; enforced by validateTrack(). */
  keys: Key<T>[];
  /** Studio may own this track's keys via sidecar (§6.2). */
  editable?: boolean;
  /** Reserved (§2.2/§B.6): v2 additive blending. v1 accepts but ignores it (coalesce stays last-wins). */
  additive?: boolean;
}

export class TrackValidationError extends Error {
  constructor(target: string, message: string) {
    super(`track '${target}': ${message}`);
    this.name = 'TrackValidationError';
  }
}

export function validateTrack(track: Track): void {
  const vt = getValueType(track.type); // throws on unknown type
  if (track.keys.length === 0) {
    throw new TrackValidationError(track.target, 'must have at least one key');
  }
  // Discrete (hold-only) types can't interpolate; a non-hold key would silently
  // degrade to a t=1 snap. Canonicalize to an explicit hold — behaviorally a
  // no-op for these types (lerp already returns prev until t≥1), but it makes
  // the document honest and a curve editor can't offer a meaningless ease. (§2.2)
  if (vt.defaultHandoff === 'cut') {
    for (const k of track.keys) {
      if (k.interp !== 'hold') k.interp = 'hold';
    }
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

/**
 * The settle-ON-the-beat helper: a spring key must sit at prev.t +
 * spring.duration(cfg) (§2.7), so beat-anchored authoring otherwise means
 * hand-computing the launch time. springTo returns the [launch, settle] key
 * pair with the arithmetic done — spread it into a raw track():
 *   track('x/width', 'number', [...springTo(beats.start('drop'), 0, 320, cfg)])
 */
export function springTo<T>(endT: number, from: T, to: T, cfg: SpringConfig): [Key<T>, Key<T>] {
  const d = springFactory.duration(cfg);
  if (endT - d < 0) {
    throw new TrackValidationError(
      'springTo',
      `this spring needs ${d.toFixed(3)}s to settle — endT must be ≥ its duration (got ${endT})`,
    );
  }
  return [key(endT - d, from), key(endT, to, springFactory(cfg))];
}

/**
 * Cascade a set of tracks by shifting each one's key times — the classic
 * stagger for animating a list of nodes with a delay between them. `delay` is
 * the per-index gap in seconds, or a function of the index for non-linear
 * cascades. Pure: returns new tracks, leaving the inputs untouched.
 *
 *   stagger(items.map((it, i) => track(`${it.id}/opacity`, 'number',
 *     [key(0, 0), key(0.3, 1, 'easeOutCubic')])), 0.08)
 */
export function stagger<T>(tracks: readonly Track<T>[], delay: number | ((index: number) => number)): Track<T>[] {
  const at = typeof delay === 'function' ? delay : (i: number): number => i * delay;
  return tracks.map((tr, i) => {
    const d = at(i);
    return { ...tr, keys: tr.keys.map((k) => ({ ...k, t: k.t + d })) };
  });
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
    const h = 1 / 1024; // §B.5 pins the symmetric-difference step for cross-engine replay reproducibility
    return (u) => (fn(Math.min(1, u + h)) - fn(Math.max(0, u - h))) / (Math.min(1, u + h) - Math.max(0, u - h));
  }
  if (spec.kind === 'cubicBezier') return cubicBezierDerivative(...spec.pts);
  return springEasingDerivative(spec);
}

interface SamplerState {
  /** Index of the segment's arrival key last used; hint only. */
  cursor: number;
  easeCache: (EasingFn | undefined)[];
  /** True once we've warned that a non-extrapolating type clamped an out-of-range eased value. */
  warnedClamp?: boolean;
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
  if (!vt.extrapolates && (easedT < 0 || easedT > 1)) {
    // overshoot on a path/discrete type can't extrapolate — clamp, but say so once
    if (!s.warnedClamp) {
      s.warnedClamp = true;
      emitDevWarning(
        `track '${tr.target}' (type '${tr.type}') clamped an out-of-range eased value — ` +
          `non-extrapolating types can't overshoot, so a spring/overshooting ease on this track is flattened`,
      );
    }
    easedT = Math.min(1, Math.max(0, easedT));
  }
  return vt.lerp(prev.value, arrival.value, easedT);
}

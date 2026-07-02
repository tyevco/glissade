/**
 * Track & keyframe model (DESIGN.md §2.2) and sampling (§2.4): binary search
 * per track with a last-segment cursor — sanctioned memoization, semantics
 * identical to a cold search (property-tested).
 */

import {
  cubicBezier,
  cubicBezierDerivative,
  easingDerivatives,
  mirrorEase,
  namedEasing,
  type EaseSpec,
  type EasingFn,
} from './easing.js';
import { spring as springFactory, springEasing, springEasingDerivative, type SpringConfig } from './spring.js';
import { emitDevWarning } from './devWarning.js';
import { getValueType, type ValueTypeId } from './valueTypes.js';

// ── Expr seam (0.40) ─────────────────────────────────────────────────────────
// The formula evaluator lives OFF the base embed on `@glissade/core/expr` (it's a
// ~1.4 kB parser). Importing that entry registers the compiler here; the base
// sampler only carries this tiny seam, so a scene that never uses an expr track
// pays nothing. sampleTrack/validateTrack call the registered compiler.
type ExprEvalFn = (t: number) => number;
let exprCompiler: ((src: string) => ExprEvalFn) | null = null;
/** Register the expr compiler (called on `@glissade/core/expr` import). */
export function setExprCompiler(fn: (src: string) => ExprEvalFn): void {
  exprCompiler = fn;
}
const NO_EXPR = "expr tracks need `import '@glissade/core/expr'`";

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
  /**
   * Expr (0.40): a serializable math-formula of the playhead `t`
   * (e.g. `'100 + 50*sin(t*2)'`). When set, the track is sampled by evaluating the
   * formula at `t` instead of interpolating `keys` (which may be empty). `type`
   * must be 'number'. Compiled once + cached; a pure function of `t` (+ seeded
   * `rand`), so the SAME time channel + determinism as keyframes.
   */
  expr?: string;
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

const TARGET_SHAPE = /^[^/]+\/.+$/;
const TARGET_MSG = "target must be '<nodeId>/<prop.path>' (e.g. 'circle/opacity')";

export function validateTrack(track: Track): void {
  const vt = getValueType(track.type); // throws on unknown type
  if (!TARGET_SHAPE.test(track.target)) throw new TrackValidationError(track.target, TARGET_MSG);
  // Expr (0.40): a formula track is validated by compiling its expression (fail
  // loud on bad syntax / unknown fn / arity) — it needs no keys, but MUST be
  // numeric. Compile-validated eagerly when `@glissade/core/expr` is imported
  // (compiler registered); otherwise checked at first sample.
  if (track.expr !== undefined) {
    if (track.type !== 'number') {
      throw new TrackValidationError(track.target, `an expr track must be type 'number' (got '${track.type}')`);
    }
    if (exprCompiler) {
      try {
        exprCompiler(track.expr);
      } catch (e) {
        throw new TrackValidationError(track.target, `invalid expr: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return;
  }
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
  // Fail loud on a non-numeric keyframe value for a numeric type. A value type
  // whose repr is number/vec2 does arithmetic in lerp — a function (the classic
  // "keyed to `node.height` instead of `node.height()`" — a signal accessor IS a
  // function), NaN, or undefined silently propagates to NaN and detonates much
  // later as a native backend panic (a Skia abort with no source location). Catch
  // it here with the target + t named. Additive: every valid finite key passes,
  // so all goldens stay byte-identical. (Two canary seats' paired 0.32 nit.)
  const repr = (vt as { repr?: string }).repr ?? vt.id;
  if (repr === 'number' || repr === 'vec2') {
    for (const k of track.keys) {
      const ok =
        repr === 'number'
          ? typeof k.value === 'number' && Number.isFinite(k.value)
          : Array.isArray(k.value) &&
            k.value.length === 2 &&
            (k.value as unknown[]).every((n) => typeof n === 'number' && Number.isFinite(n));
      if (!ok) {
        const got =
          typeof k.value === 'function'
            ? 'a function (a signal accessor? call it — e.g. node.height(), not node.height)'
            : typeof k.value === 'object'
              ? JSON.stringify(k.value)
              : String(k.value);
        throw new TrackValidationError(
          track.target,
          `${repr} keyframe at t=${k.t} must be ${repr === 'number' ? 'a finite number' : 'a [x, y] of finite numbers'}, got ${got}`,
        );
      }
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

export interface RetimeSpec {
  /** playback rate: 2 = twice as fast (key times ÷ speed), 0.5 = half speed. Must be > 0. Default 1. */
  speed?: number;
  /** seconds added to every key time (applied AFTER speed/reverse) — delay or advance the group. Default 0. */
  shift?: number;
  /** play the schedule BACKWARD in place — same [start,end] span, values reversed, eases time-mirrored. */
  reverse?: boolean;
  /** forward THEN reversed as one there-and-back track (roughly doubles the active
   *  span). PER-TRACK: each track mirrors about its OWN last key, so tracks with
   *  different spans return at different times — pad shorter tracks with an end
   *  key first if a multi-track group must turn around together. */
  pingpong?: boolean;
}

/** Minimal reversed copy of a key schedule: mirror times about [t0,tn], reverse
 * the value order, and time-mirror each segment's ease so it plays identically
 * backward. Throws on `hold` segments (asymmetric — can't reverse cleanly). */
function reversedKeys<T>(keys: Key<T>[]): Key<T>[] {
  const n = keys.length;
  if (n < 2) return keys.map((k) => ({ t: k.t, value: k.value }));
  const t0 = keys[0]!.t;
  const tn = keys[n - 1]!.t;
  const out: Key<T>[] = [];
  for (let j = 0; j < n; j++) {
    const src = keys[n - 1 - j]!;
    const k: Key<T> = { t: t0 + tn - src.t, value: src.value };
    if (j >= 1) {
      // the segment arriving at out[j] is the OLD segment departing from `src`,
      // i.e. old arrival key (n-j), traversed backward → mirror ITS ease.
      const oldArrival = keys[n - j]!;
      if (oldArrival.interp === 'hold') {
        throw new TrackValidationError(
          'retime',
          'cannot reverse/pingpong a track with a hold segment (a hold is asymmetric in time) — ' +
            'retime it with { speed } / { shift }, or author the reversed schedule explicitly',
        );
      }
      const m = mirrorEase(oldArrival.ease);
      if (m !== undefined) k.ease = m;
    }
    out.push(k);
  }
  return out;
}

/**
 * Retime a set of tracks by remapping their key TIMES — slow-mo/fast (`speed`),
 * delay/advance (`shift`), `reverse`, or `pingpong` — as a pure build-time
 * transform. Because it rewrites the schedule into an ordinary `Track[]` (no
 * runtime clock warp, no cross-frame state), evaluate() stays a pure function of
 * time and the result is golden-stable and O(log keys) scrubbable like any doc.
 * Reverse/pingpong time-mirror each segment's ease exactly for the built-in
 * eases and cubicBezier; springs and hold segments fail loud (they're causal /
 * asymmetric). Returns NEW tracks; the inputs are untouched.
 *
 *   retime(move, { speed: 0.5 })            // half speed
 *   retime(move, { reverse: true })         // play it backward
 *   retime(move, { pingpong: true })        // there and back
 */
export function retime<T>(tracks: readonly Track<T>[], spec: RetimeSpec): Track<T>[] {
  const speed = spec.speed ?? 1;
  if (!(speed > 0) || !Number.isFinite(speed)) {
    throw new TrackValidationError('retime', `speed must be a finite number > 0 (got ${speed})`);
  }
  if (spec.reverse && spec.pingpong) {
    throw new TrackValidationError('retime', 'pass reverse OR pingpong, not both');
  }
  const shift = spec.shift ?? 0;
  return tracks.map((tr) => {
    let keys: Key<T>[] = tr.keys.map((k) => ({ ...k, t: k.t / speed }));
    if (spec.reverse) keys = reversedKeys(keys);
    if (spec.pingpong && keys.length >= 2) {
      const t0 = keys[0]!.t;
      const tn = keys[keys.length - 1]!.t;
      const back = reversedKeys(keys).map((k) => ({ ...k, t: k.t + (tn - t0) }));
      keys = [...keys, ...back.slice(1)]; // drop the shared midpoint (== forward's last key)
    }
    if (shift !== 0) keys = keys.map((k) => ({ ...k, t: k.t + shift }));
    return { ...tr, keys };
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

/**
 * Expr (0.40): build a raw formula-driven numeric track — `{ target, type:
 * 'number', keys: [], expr }`. The public `exprTrack()` (on `@glissade/core/expr`,
 * which also registers the evaluator) wraps this + validates. Kept here (base) so
 * `tl.expr` can emit a track without dragging the evaluator onto the embed.
 */
export function makeExprTrack(target: string, formula: string): Track<number> {
  const tr: Track<number> = { target, type: 'number', keys: [], expr: formula };
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
  /** Expr (0.40): the compiled formula evaluator, lazily compiled on first sample + cached. */
  exprEval?: ExprEvalFn;
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
  // Expr (0.40): a formula-driven track evaluates its compiled expression at the
  // playhead `t` instead of interpolating keys. Compiled once, cached on the
  // per-track state — pure in `t`, same channel as keyframes.
  if (tr.expr !== undefined) {
    const s = state(tr as Track);
    if (!exprCompiler) throw new TrackValidationError(tr.target, NO_EXPR);
    s.exprEval ??= exprCompiler(tr.expr);
    return s.exprEval(t) as T;
  }
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

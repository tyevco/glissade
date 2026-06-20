/**
 * Playhead + timeline binding (DESIGN.md §2.4): animated properties are not
 * written each frame — binding rewires each targeted signal's source to
 * `() => sampleTrack(track, playhead())`, so evaluation stays pull-only and
 * unchanged samples don't propagate dirtiness.
 */

import { beginReadPhase, endReadPhase, signal, type BindableSignal } from './signal.js';
import { sampleTrack, velocityAt, type Track } from './track.js';
import { type CompiledTimeline } from './timeline.js';
import { type ValueTypeId } from './valueTypes.js';

export type Playhead = BindableSignal<number>;

export function createPlayhead(initial = 0): Playhead {
  return signal(initial);
}

export class UnboundTargetError extends Error {
  constructor(target: string) {
    super(`timeline targets '${target}' but no property signal resolves to it`);
    this.name = 'UnboundTargetError';
  }
}

/**
 * A track's value type doesn't match the shape of the property it targets — the
 * silent-NaN class (§2.2): e.g. a scalar `number` track bound to a `vec2` prop
 * makes the compound a number, its `.x`/`.y` index it to `undefined`, and the
 * node's matrix goes NaN — the node and its subtree vanish. Caught at BIND time
 * (the track's type is known then), the precedent being UnboundTargetError:
 * mismatched binds are build errors, not silent no-ops.
 */
export class BindTypeMismatchError extends Error {
  /** The accepted type(s) — a single id, or the set a polymorphic prop (e.g. `fill`: color|paint) admits. */
  readonly expected: ValueTypeId | readonly ValueTypeId[];
  constructor(
    readonly target: string,
    readonly got: ValueTypeId,
    expected: ValueTypeId | readonly ValueTypeId[],
  ) {
    const prop = target.slice(target.lastIndexOf('/') + 1);
    const want = [expected].flat();
    // The vec2↔scalar shape gets a component-targeting hint — the popIn/pulse
    // silent-NaN class this guard exists to catch.
    const hint = got === 'number' && want.includes('vec2') ? `; target '${prop}.x'/'${prop}.y' or author a vec2 track` : '';
    super(`track '${target}' is '${got}' but '${prop}' expects '${want.join("'|'")}' (would silently NaN evaluation)${hint}`);
    this.name = 'BindTypeMismatchError';
    this.expected = expected;
  }
}

export interface BindTarget {
  bindSource(fn: () => unknown): void;
  unbindSource(): void;
  /**
   * The value type this target accepts; a track of any other type is a bind
   * error. An ARRAY for a polymorphic prop that admits more than one type
   * (e.g. a Shape `fill` accepts both `color` and `paint`, or a vec2 prop that
   * accepts both `vec2` and `vec2-arc`). UNDEFINED means the target opted OUT
   * of the guard (an untagged custom-node prop — back-compat with 0.13, which
   * had no guard): any track binds without a type check.
   */
  readonly expects: ValueTypeId | readonly ValueTypeId[] | undefined;
}

/** Analytic value/velocity access to one bound target (v2 addendum §B.6). */
export interface CurveSampler {
  readonly track: Track;
  /** Pure sample at local timeline time t. */
  value(t: number): unknown;
  /** Analytic derivative per §B.3 conventions; null for types without operators. */
  velocity(t: number): unknown | null;
}

export interface BoundTimeline {
  playhead: Playhead;
  /** Per-target analytic samplers (additive, v2 §B.6); machines read these. */
  samplers: ReadonlyMap<string, CurveSampler>;
  /** Detach every track binding, freezing signals at their last values. */
  unbind(): void;
}

/**
 * Bind a compiled timeline's tracks to property signals. `resolve` returns
 * the signal for a target path, or undefined — which is a compile-time-style
 * error (§2.2: unbound tracks are build errors, not silent no-ops).
 */
export function bindTimeline(
  compiled: CompiledTimeline,
  resolve: (target: string) => BindTarget | undefined,
  playhead: Playhead = createPlayhead(),
): BoundTimeline {
  const bound: BindTarget[] = [];
  const samplers = new Map<string, CurveSampler>();
  for (const [target, tr] of compiled.tracks) {
    const sig = resolve(target);
    if (!sig) throw new UnboundTargetError(target);
    const got = (tr as Track).type;
    const expects = sig.expects;
    // An UNtagged target (expects === undefined) skips the guard — back-compat
    // with 0.13's no-guard custom-node seam: a custom node opts INTO the guard
    // by tagging its registerTarget call. Built-in nodes stay tagged.
    if (expects !== undefined) {
      const ok = Array.isArray(expects) ? expects.includes(got) : got === expects;
      if (!ok) throw new BindTypeMismatchError(target, got, expects);
    }
    sig.bindSource(() => sampleTrack(tr as Track, playhead()));
    bound.push(sig);
    samplers.set(target, {
      track: tr as Track,
      value: (t) => sampleTrack(tr as Track, t),
      velocity: (t) => velocityAt(tr as Track, t),
    });
  }
  return {
    playhead,
    samplers,
    unbind: () => {
      for (const sig of bound) sig.unbindSource();
    },
  };
}

/**
 * The evaluation entry discipline (§2.5): the playhead write is the sanctioned
 * entry mutation, then the read phase begins and `read` must be pure.
 */
export function evaluateAt<R>(playhead: Playhead, t: number, read: () => R): R {
  playhead.forceSet(t);
  beginReadPhase();
  try {
    return read();
  } finally {
    endReadPhase();
  }
}

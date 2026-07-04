/**
 * Playhead + timeline binding (DESIGN.md §2.4): animated properties are not
 * written each frame — binding rewires each targeted signal's source to
 * `() => sampleTrack(track, playhead())`, so evaluation stays pull-only and
 * unchanged samples don't propagate dirtiness.
 */

import { beginReadPhase, endReadPhase, signal, type BindableSignal } from './signal.js';
import { emitDevWarning } from './devWarning.js';
import { sampleTrack, velocityAt, type Track } from './track.js';
import { type CompiledTimeline } from './timeline.js';
import { reprOf, type ValueTypeId } from './valueTypes.js';

export type Playhead = BindableSignal<number>;

export function createPlayhead(initial = 0): Playhead {
  return signal(initial);
}

export class UnboundTargetError extends Error {
  /**
   * `message` overrides the default generic text — the seam a layer with more
   * context (e.g. `scene`, which knows the node's construction-prop schema) uses
   * to throw a friendlier, more specific reason while keeping the same error
   * type (so existing `instanceof UnboundTargetError` catches still fire).
   */
  constructor(target: string, message?: string) {
    super(message ?? `timeline targets '${target}' but no property signal resolves to it`);
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
   * The value type this target accepts; a track whose REPRESENTATION (its
   * `repr`, single-hop) differs is a bind error. So a `vec2-arc` track (repr
   * 'vec2') binds to a plain `'vec2'` target, and a custom `cents` (repr
   * 'number') binds to a `'number'` target — the extension door (0.15). An
   * ARRAY is for GENUINE polymorphism — distinct reprs admitted at one prop
   * (e.g. a Shape `fill` accepts both `color` and `paint`). UNDEFINED means the
   * target opted OUT of the guard (an untagged custom-node prop — back-compat
   * with 0.13, which had no guard): any track binds without a type check.
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
 * Optional knobs for {@link bindTimeline}.
 */
export interface BindOptions {
  /**
   * Asked for a friendlier message when a target fails to resolve. `core` knows
   * nothing about node types or construction props; a caller with that context
   * (e.g. `scene`) can return a more-specific reason string — used verbatim as
   * the {@link UnboundTargetError} message — or `undefined` to fall through to
   * the generic "no property signal resolves to it".
   */
  unboundMessage?: (target: string) => string | undefined;
  /**
   * 0.59 "fail-loud ground floor" MODE GATE. What binding does when a track
   * target fails to resolve to any property signal:
   *
   * - `'throw'` (DEFAULT — loud) raises {@link UnboundTargetError} at bind, the
   *   dev/CI behavior authors want (a typo'd target is a build error, §2.2).
   * - `'warn'` DOWNGRADES the throw to a one-line dev-warning and SKIPS the
   *   track. Shipped/prod embeds opt into this via `mount({ production: true })`,
   *   so an external scene degrades (the offending track simply doesn't apply)
   *   instead of hard-failing the whole render.
   *
   * DETERMINISM (0.59 invariant): the leaf `if (!sig)` below is the ONLY branch
   * that differs between modes. A VALID scene (every target resolves) never
   * reaches it, so both modes install the IDENTICAL bindings and produce
   * byte-identical output — the mode is byte-neutral for every valid scene.
   */
  onUnbound?: 'throw' | 'warn';
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
  options: BindOptions = {},
): BoundTimeline {
  const bound: BindTarget[] = [];
  const samplers = new Map<string, CurveSampler>();
  for (const [target, tr] of compiled.tracks) {
    const sig = resolve(target);
    if (!sig) {
      // 0.59 MODE GATE — the SOLE throw-vs-warn branch (byte-neutral for valid
      // scenes: they never enter this arm). Default (`'throw'`) is loud; a prod
      // embed's `'warn'` downgrades to a dev-warning and skips the dead track.
      const message = options.unboundMessage?.(target);
      if (options.onUnbound === 'warn') {
        emitDevWarning(
          message ??
            `timeline targets '${target}' but no property signal resolves to it — track skipped (production mode)`,
        );
        continue;
      }
      throw new UnboundTargetError(target, message);
    }
    const got = (tr as Track).type;
    const expects = sig.expects;
    // An UNtagged target (expects === undefined) skips the guard — back-compat
    // with 0.13's no-guard custom-node seam: a custom node opts INTO the guard
    // by tagging its registerTarget call. Built-in nodes stay tagged.
    if (expects !== undefined) {
      // Repr-compatibility (0.15): compare REPRESENTATIONS, not raw ids — the
      // track's type and each accepted type resolve to their `repr` (an id with
      // no `repr` resolves to itself, single-hop). So `vec2-arc` (repr 'vec2')
      // binds to a plain-'vec2' prop, and a custom `cents` (repr 'number') binds
      // to a 'number' prop — the documented extension door. The array form is
      // kept for GENUINE polymorphism (e.g. fill: color|paint — distinct reprs).
      const gotRepr = reprOf(got);
      const accepted: readonly ValueTypeId[] = Array.isArray(expects) ? expects : [expects];
      const ok = accepted.some((e) => reprOf(e) === gotRepr);
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

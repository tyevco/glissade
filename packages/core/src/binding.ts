/**
 * Playhead + timeline binding (DESIGN.md §2.4): animated properties are not
 * written each frame — binding rewires each targeted signal's source to
 * `() => sampleTrack(track, playhead())`, so evaluation stays pull-only and
 * unchanged samples don't propagate dirtiness.
 */

import { beginReadPhase, endReadPhase, signal, type BindableSignal } from './signal.js';
import { sampleTrack, velocityAt, type Track } from './track.js';
import { type CompiledTimeline } from './timeline.js';

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

export interface BindTarget {
  bindSource(fn: () => unknown): void;
  unbindSource(): void;
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

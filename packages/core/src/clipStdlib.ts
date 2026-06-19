/**
 * Stdlib motion clips (DESIGN.md §2 build-time sugar): a small set of `clip(...)`
 * literals for the common entrance / emphasis / ambient motions. Tree-shakeable —
 * shipped from the `@glissade/core/clips` SUB-PATH, never the base index, because
 * the keyframe literals are the byte weight (the base core budget is tight).
 *
 * Loop clips (`pulse`, `driftLoop`) author first-key-value == last-key-value, so
 * tiling them under `clipList` (or repeating the clip) reads seamlessly.
 */

import { key } from './track.js';
import { clip, type Clip } from './clip.js';
import type { EaseSpec } from './easing.js';
import type { Vec2 } from './valueTypes.js';

export interface DurationOpts {
  /** Total clip length in seconds. */
  duration?: number;
  /** Arriving ease of the motion. */
  ease?: EaseSpec;
}

/** Entrance: opacity 0→1 and scale 0.8→1 (a "pop" in). */
export function popIn(opts?: DurationOpts): Clip {
  const d = opts?.duration ?? 0.3;
  const ease: EaseSpec = opts?.ease ?? 'easeOutCubic';
  return clip({
    channels: {
      opacity: { path: 'opacity', keys: [key(0, 0), key(d, 1, ease)] },
      scale: { path: 'scale', keys: [key(0, 0.8), key(d, 1, ease)] },
    },
  });
}

export type SlideEdge = 'left' | 'right' | 'top' | 'bottom';

/**
 * Entrance: fade in while sliding a position OFFSET in from one edge. The offset
 * channel binds to a `position` suffix by default and animates a vec2 from the
 * edge-displaced point to [0,0], so it composes as a local translation.
 */
export function slideIn(edge: SlideEdge, opts?: (DurationOpts & { distance?: number })): Clip {
  const d = opts?.duration ?? 0.3;
  const ease: EaseSpec = opts?.ease ?? 'easeOutCubic';
  const dist = opts?.distance ?? 40;
  const from: Vec2 =
    edge === 'left' ? [-dist, 0] : edge === 'right' ? [dist, 0] : edge === 'top' ? [0, -dist] : [0, dist];
  return clip({
    channels: {
      opacity: { path: 'opacity', keys: [key(0, 0), key(d, 1, ease)] },
      offset: { path: 'position', keys: [key(0, from), key(d, [0, 0] as Vec2, ease)] },
    },
  });
}

/** Emphasis: a single scale up-and-back pulse. First/last value match (loopable). */
export function pulse(opts?: (DurationOpts & { scale?: number })): Clip {
  const d = opts?.duration ?? 0.4;
  const ease: EaseSpec = opts?.ease ?? 'easeInOutSine';
  const peak = opts?.scale ?? 1.1;
  return clip({
    channels: {
      scale: { path: 'scale', keys: [key(0, 1), key(d / 2, peak, ease), key(d, 1, ease)] },
    },
  });
}

/**
 * Ambient: a slow position drift out and back. First/last value match, so tiling
 * (clipList or repeat) reads as a continuous loop with no seam.
 */
export function driftLoop(opts?: (DurationOpts & { amplitude?: number })): Clip {
  const d = opts?.duration ?? 2;
  const ease: EaseSpec = opts?.ease ?? 'easeInOutSine';
  const a = opts?.amplitude ?? 8;
  return clip({
    channels: {
      drift: {
        path: 'position',
        keys: [key(0, [0, 0] as Vec2), key(d / 2, [a, 0] as Vec2, ease), key(d, [0, 0] as Vec2, ease)],
      },
    },
  });
}

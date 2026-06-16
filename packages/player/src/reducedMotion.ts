/**
 * prefers-reduced-motion policy (DESIGN.md §4.2). Player policy, not a core
 * concern — `evaluate()` knows nothing about it. Pure and DOM-free so it can be
 * unit-tested; mount() detects the media query and applies the returned plan.
 *
 * Default `'respect'`: when reduced motion is preferred, autoplay is suppressed
 * and the playhead jumps to the timeline's `posterTime` (its end state by
 * default, §2.3). `'ignore'` opts out. The function form lets an author hand
 * back a calmer alternative timeline (e.g. a cross-fade), swapped in via §4.3.
 */

import type { Timeline } from '@glissade/core';

export type ReducedMotionMode = 'respect' | 'ignore' | ((doc: Timeline) => Timeline);

export interface ReducedMotionPlan {
  /** Whether to autoplay after applying the plan. */
  autoplay: boolean;
  /** Seek the playhead here before first paint (the poster frame). */
  seekTo?: number;
  /** Replace the bound timeline with this calmer alternative (the fn form). */
  swapTo?: Timeline;
}

export function planReducedMotion(
  mode: ReducedMotionMode | undefined,
  prefersReduced: boolean,
  doc: Timeline,
  duration: number,
  autoplayRequested: boolean,
): ReducedMotionPlan {
  const m = mode ?? 'respect';
  if (m === 'ignore' || !prefersReduced) return { autoplay: autoplayRequested };
  if (typeof m === 'function') {
    // calmer alternative: play it (it's already the reduced variant), no poster seek
    return { autoplay: autoplayRequested, swapTo: m(doc) };
  }
  // 'respect': hold the poster frame, never autoplay
  return { autoplay: false, seekTo: doc.posterTime ?? duration };
}

/** Live `prefers-reduced-motion: reduce` reading; false off-DOM. */
export function mediaPrefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

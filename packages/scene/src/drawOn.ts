/**
 * Whiteboard kit: one-call "draw this shape on" tracks. A stroked or sketched
 * shape's `reveal` (0..1) animates it stroking itself on; `drawOn` builds that
 * track, and `drawOnEach` cascades a list of shapes one after another (the
 * classic whiteboard sequence) via the core `stagger` helper.
 */

import { key, stagger, track, type EaseSpec, type Track } from '@glissade/core';

export interface DrawOnOptions {
  /** when the stroke-on starts, seconds; default 0 */
  start?: number;
  /** how long it takes, seconds; default 1 */
  duration?: number;
  /** the ease arriving at fully drawn; default 'easeInOutCubic' */
  ease?: EaseSpec;
}

/** A `<id>/reveal` track running 0→1 — point a stroked/sketched shape at it to
 * hand-draw itself on. `target` is the node id. */
export function drawOn(target: string, opts: DrawOnOptions = {}): Track<number> {
  const start = opts.start ?? 0;
  const duration = opts.duration ?? 1;
  const ease = opts.ease ?? 'easeInOutCubic';
  return track(`${target}/reveal`, 'number', [key(start, 0), key(start + duration, 1, ease)]);
}

export interface DrawOnEachOptions extends DrawOnOptions {
  /** gap between each shape starting, seconds; default 0.6 × duration */
  delay?: number;
}

/** Cascade several shapes drawing themselves on, one after another — the
 * whiteboard sequence. Returns one reveal track per id, staggered by `delay`. */
export function drawOnEach(targets: readonly string[], opts: DrawOnEachOptions = {}): Track<number>[] {
  const delay = opts.delay ?? (opts.duration ?? 1) * 0.6;
  return stagger(
    targets.map((t) => drawOn(t, opts)),
    delay,
  );
}

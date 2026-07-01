/**
 * Echo (0.26): motion trails / onion-skin. A wrapper group that renders its
 * children K times — at the playhead and at K−1 earlier offsets (t − i·spacing)
 * — each trailing copy fading by `decay`. The leading copy is the live frame;
 * the ghosts are the subtree "as it was" a few slices ago.
 *
 * It is the pure render form of "re-evaluate at t + k·spacing": within one
 * frame it re-addresses the SCENE PLAYHEAD to each offset time, emits the
 * children (whose bound signals re-derive at that time — tracks, followPath,
 * computeds all follow), then RESTORES the playhead before the walk continues.
 * The whole dance is wrapped in `batch()` so the playhead's subscribers (a
 * player repaint) coalesce to a single, idempotent notification at the restored
 * time — never a mid-emit reentrancy storm. Headless (goldens/export) the
 * playhead has no subscribers, so it is a plain pure multi-sample: evaluate()
 * stays a pure function of time and the DisplayList is byte-stable.
 *
 * Determinism note: the offsets are pure functions of the current playhead, so
 * a cold re-eval reproduces byte-identically (the cache-cold audit passes).
 * Ghost times before the first key clamp to the initial pose (track semantics).
 */

import { batch } from '@glissade/core';
import { type DisplayListBuilder } from './displayList.js';
import { Group } from './nodes.js';
import { type EvalContext, type Node, type NodeProps } from './node.js';

export interface EchoProps extends NodeProps {
  children?: Node[];
  /** total copies including the live one (≥ 1); default 5. */
  count?: number;
  /** seconds between successive copies (the trail's time spread); default 0.08. */
  spacing?: number;
  /** opacity multiplier per trailing step — copy i has opacity decay^i (0..1); default 0.6. */
  decay?: number;
}

export class Echo extends Group {
  override get describeType(): string {
    return 'Echo';
  }
  readonly count: number;
  readonly spacing: number;
  readonly decay: number;

  constructor(props: EchoProps = {}) {
    super(props);
    this.count = Math.max(1, Math.floor(props.count ?? 5));
    this.spacing = props.spacing ?? 0.08;
    this.decay = props.decay ?? 0.6;
  }

  protected override draw(out: DisplayListBuilder, ctx: EvalContext): void {
    const playhead = ctx.playhead;
    // degenerate cases → a plain group at the current time (no playhead ⇒ a bare
    // hand-built ctx, so we can't re-address time; emit the live copy only)
    if (this.count <= 1 || this.spacing === 0 || playhead === undefined) {
      super.draw(out, ctx);
      return;
    }
    const now = ctx.time;
    // Batch coalesces every playhead write below into ONE subscriber flush at
    // the restored `now` (idempotent in the player; a no-op headless).
    batch(() => {
      try {
        // OLDEST copy first so the live copy (i=0) paints last, i.e. on top.
        for (let i = this.count - 1; i >= 0; i--) {
          const alpha = i === 0 ? 1 : this.decay ** i;
          if (alpha <= 0) continue;
          const offsetT = now - i * this.spacing;
          playhead.forceSet(offsetT); // re-address time; bound signals re-derive
          out.push({ op: 'pushGroup', opacity: alpha, blend: 'source-over', filters: [] });
          super.draw(out, { ...ctx, time: offsetT });
          out.push({ op: 'popGroup' });
        }
      } finally {
        playhead.forceSet(now); // restore before the walk resumes (siblings sample at `now`)
      }
    });
  }
}

/** `children: [echo(mover, { count: 6, spacing: 0.05 })]` — mover leaves a fading trail.
 * A convenience wrapper: pass the trailing content as children of the returned Echo. */
export function echo(child: Node, props: Omit<EchoProps, 'children'> = {}): Echo {
  return new Echo({ ...props, children: [child] });
}

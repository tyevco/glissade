/**
 * MotionBlur (0.30): real sampled motion blur — the flagship motion-craft feature.
 * It renders its subtree at N sub-frame times across a shutter interval centered on
 * the current frame and AVERAGES them, so a fast-moving element smears exactly the
 * way an analog shutter captures it — and it tracks EVERY animated prop (position,
 * rotation, scale, path progress, colour), not a faked directional blur.
 *
 * Like `Echo`, it re-addresses the scene playhead within one frame (wrapped in
 * `batch()`, restored after) to sample sub-frame times. The averaging is a running
 * mean done with plain compositing, NO backend change: paint the k-th sample (of N)
 * at opacity 1/(k+1). Over source-over that is the exact equal-weight mean —
 *   L₀=∅; Lₖ₊₁ = Lₖ·(k/(k+1)) + sₖ·(1/(k+1)) = mean(s₀…sₖ)
 * — so all N samples contribute equally (unlike a decaying trail). Each sub-frame t
 * is a pure function of the current time, so evaluate() stays deterministic and the
 * result is byte-stable on Skia (the golden twin); browser↔Skia is perceptual-tier
 * for blur, marked in describe().
 *
 * Ships on the base scene index alongside Echo/ShaderEffect (off the closed 9-node
 * taxonomy). No blur ⇒ pass `samples: 1` or `shutter: 0` and it's a plain group.
 */

import { batch } from '@glissade/core';
import { type DisplayListBuilder } from './displayList.js';
import { Group } from './nodes.js';
import { type EvalContext, type Node, type NodeProps } from './node.js';

export interface MotionBlurProps extends NodeProps {
  children?: Node[];
  /** the shutter interval in SECONDS, centered on the frame time (0 = no blur); default 0.04. */
  shutter?: number;
  /** number of sub-frame samples averaged across the shutter (≥ 1); default 8. */
  samples?: number;
}

export class MotionBlur extends Group {
  override get describeType(): string {
    return 'MotionBlur';
  }
  readonly shutter: number;
  readonly samples: number;

  constructor(props: MotionBlurProps = {}) {
    super(props);
    this.shutter = props.shutter ?? 0.04;
    this.samples = Math.max(1, Math.floor(props.samples ?? 8));
  }

  protected override draw(out: DisplayListBuilder, ctx: EvalContext): void {
    const playhead = ctx.playhead;
    // degenerate → a plain group at the current time
    if (this.samples <= 1 || this.shutter === 0 || playhead === undefined) {
      super.draw(out, ctx);
      return;
    }
    const now = ctx.time;
    const n = this.samples;
    // batch coalesces every playhead write into ONE subscriber flush at the
    // restored `now` (idempotent in the player; a no-op headless).
    batch(() => {
      try {
        for (let i = 0; i < n; i++) {
          // centered shutter: t spans [now − shutter/2, now + shutter/2]
          const t = now + (i / (n - 1) - 0.5) * this.shutter;
          // running-mean weight: the k-th painted sample at 1/(k+1) → equal-weight average
          const opacity = 1 / (i + 1);
          playhead.forceSet(t);
          out.push({ op: 'pushGroup', opacity, blend: 'source-over', filters: [] });
          super.draw(out, { ...ctx, time: t });
          out.push({ op: 'popGroup' });
        }
      } finally {
        playhead.forceSet(now); // restore before the walk resumes (siblings sample at `now`)
      }
    });
  }
}

/** `children: [motionBlur(fastDot, { shutter: 0.05 })]` — fastDot smears with real
 * sub-frame motion blur. Wrap the moving content; its background stays crisp. */
export function motionBlur(child: Node, props: Omit<MotionBlurProps, 'children'> = {}): MotionBlur {
  return new MotionBlur({ ...props, children: [child] });
}

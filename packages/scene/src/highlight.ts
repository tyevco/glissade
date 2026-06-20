/**
 * Marker-style text highlight: per-line rounded rects behind a Text node's
 * laid-out lines, swept by ONE 0→1 progress track in reading order. Lines
 * come from Text.lineBoxes() each frame, so the marker re-flows with wrap
 * width, font, and text animation — and the line count is dynamic because
 * the rects are draw() output, not child nodes. Pure data, both backends,
 * golden-coverable. For karaoke, key '<id>/progress' from narrate's
 * word timestamps.
 */

import { signal, type BindableSignal } from '@glissade/core';
import { type DisplayListBuilder } from './displayList.js';
import { Node, type EvalContext, type NodeProps, type PropInit } from './node.js';
import { roundedRectSegs, Text } from './nodes.js';
import { IDENTITY, matEquals } from './matrix.js';

export interface HighlightProps extends NodeProps {
  /** The Text whose lines get the marker. Place this node as an EARLIER
   * sibling (same parent) so it paints behind the glyphs. */
  text: Text;
  color?: PropInit<string>;
  /** 0→1 sweep across all lines in reading order, at constant speed weighted
   * by line width; default 1 (fully highlighted). Track: '<id>/progress'. */
  progress?: PropInit<number>;
  /** Marker overhang beyond each line's ink box, [x, y] px; default [4, 2]. */
  padding?: [number, number];
  /** Rounded marker ends; default 4 (clamped to the box). */
  cornerRadius?: number;
}

export class Highlight extends Node {
  readonly target: Text;
  readonly color: BindableSignal<string>;
  readonly progress: BindableSignal<number>;
  readonly padding: [number, number];
  readonly cornerRadius: number;

  constructor(props: HighlightProps) {
    super(props);
    this.target = props.text;
    this.color = init(signal('#ffe066'), props.color);
    this.progress = init(signal(1), props.progress);
    this.padding = props.padding ?? [4, 2];
    this.cornerRadius = props.cornerRadius ?? 4;
    this.registerTarget('progress', this.progress, 'number');
    this.registerTarget('color', this.color, 'color');
  }

  protected draw(out: DisplayListBuilder, ctx: EvalContext): void {
    const progress = Math.min(1, Math.max(0, this.progress()));
    if (progress <= 0) return;
    const [px, py] = this.padding;
    const boxes = this.target
      .lineBoxes(ctx.measurer)
      .map((b) => ({ x: b.x - px, y: b.y - py, w: b.w + 2 * px, h: b.h + 2 * py }));
    const total = boxes.reduce((sum, b) => sum + b.w, 0);
    if (total <= 0) return;

    // follow the text's transform, so the marker stays under the glyphs even
    // while the text animates — this node must share the text's parent
    const tm = this.target.localMatrix();
    if (!matEquals(tm, IDENTITY)) out.push({ op: 'transform', m: tm });

    const color = this.color();
    let remaining = progress * total;
    for (const b of boxes) {
      const fill = Math.min(b.w, remaining);
      remaining -= fill;
      if (fill <= 0) break;
      const r = Math.min(this.cornerRadius, fill / 2, b.h / 2);
      const path = out.resource({ kind: 'path', segs: roundedRectSegs(b.x, b.y, fill, b.h, r) });
      out.push({ op: 'fillPath', path, paint: { kind: 'color', color } });
      if (remaining <= 0) break;
    }
  }
}

/** `children: [highlight(title, { color: '#ffe066' }), title]` — marker behind the text. */
export function highlight(text: Text, props: Omit<HighlightProps, 'text'> = {}): Highlight {
  return new Highlight({ ...props, text });
}

function init<T>(sig: BindableSignal<T>, v: PropInit<T> | undefined): BindableSignal<T> {
  if (typeof v === 'function') sig.bindSource(v as () => T);
  else if (v !== undefined) sig.set(v);
  return sig;
}

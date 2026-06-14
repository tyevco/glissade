/**
 * Terminal-style caret for a Text node's typewriter reveal: a thin vertical bar
 * at Text.revealHead(), so it rides the reveal head as graphemes appear and
 * re-flows with wrap width, font, and align. Pure data, both backends,
 * golden-coverable — the bar is draw() output, not a child node. Place this as
 * a sibling of the Text (same parent) so it shares its transform.
 *
 * Blink is a pure function of ctx.time: on for the first half of each period.
 * With solidWhileTyping (default), the caret stays solid while the reveal is
 * still advancing (reveal < total) and only blinks once the text is fully
 * shown — the familiar "types solid, then blinks waiting" terminal feel.
 */

import { signal, type BindableSignal } from '@glissade/core';
import { type DisplayListBuilder } from './displayList.js';
import { Node, type EvalContext, type NodeProps, type PropInit } from './node.js';
import { roundedRectSegs, Text } from './nodes.js';
import { IDENTITY, matEquals } from './matrix.js';

export interface TextCursorProps extends NodeProps {
  /** The Text whose reveal head the caret follows. Place as a sibling. */
  text: Text;
  /** Blink period in seconds (full on+off cycle); default 1.06 (~0.53s each). */
  blinkPeriod?: number;
  /** Blink phase offset in seconds; default 0. */
  blinkPhase?: number;
  /** Stay solid (no blink) while the reveal is still advancing; default true. */
  solidWhileTyping?: boolean;
  /** Caret width in px; default 2. */
  width?: number;
  /** Caret color; default '' = follow the Text's fill. Track '<id>/fill'. */
  fill?: PropInit<string>;
}

export class TextCursor extends Node {
  readonly target: Text;
  readonly blinkPeriod: number;
  readonly blinkPhase: number;
  readonly solidWhileTyping: boolean;
  readonly caretWidth: number;
  readonly fill: BindableSignal<string>;

  constructor(props: TextCursorProps) {
    super(props);
    this.target = props.text;
    this.blinkPeriod = props.blinkPeriod ?? 1.06;
    this.blinkPhase = props.blinkPhase ?? 0;
    this.solidWhileTyping = props.solidWhileTyping ?? true;
    this.caretWidth = props.width ?? 2;
    this.fill = init(signal(''), props.fill);
    this.registerTarget('fill', this.fill);
  }

  protected draw(out: DisplayListBuilder, ctx: EvalContext): void {
    const head = this.target.revealHead(ctx.measurer);
    if (head.h <= 0) return;

    // solid while still typing; otherwise blink on the first half of the period
    let on = true;
    const total = this.target.graphemes(ctx.measurer).length;
    const typing = head.index < total;
    if (!(this.solidWhileTyping && typing)) {
      const period = this.blinkPeriod > 0 ? this.blinkPeriod : 1;
      const phase = ((ctx.time - this.blinkPhase) % period + period) % period;
      on = phase < period / 2;
    }
    if (!on) return;

    // ride the text's transform so the caret stays under the glyphs while the
    // text animates — this node must share the text's parent
    const tm = this.target.localMatrix();
    if (!matEquals(tm, IDENTITY)) out.push({ op: 'transform', m: tm });

    const color = this.fill() || this.target.fill();
    const path = out.resource({
      kind: 'path',
      segs: roundedRectSegs(head.x, head.y, this.caretWidth, head.h, 0),
    });
    out.push({ op: 'fillPath', path, paint: { kind: 'color', color } });
  }
}

/** `children: [title, textCursor(title)]` — a caret riding the reveal head. */
export function textCursor(text: Text, props: Omit<TextCursorProps, 'text'> = {}): TextCursor {
  return new TextCursor({ ...props, text });
}

function init<T>(sig: BindableSignal<T>, v: PropInit<T> | undefined): BindableSignal<T> {
  if (typeof v === 'function') sig.bindSource(v as () => T);
  else if (v !== undefined) sig.set(v);
  return sig;
}

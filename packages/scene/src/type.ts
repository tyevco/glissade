/**
 * `@glissade/scene/type` — `splitText()`: build-time split-text sub-targets
 * (0.19 kinetic-typography tier). A PURE PRE-EVALUATE EXPANSION: it expands a
 * Text into a `Group` of independently addressable child Texts — one per word,
 * line, or grapheme, id `${id}/${i}` — so each part animates on its own (stagger
 * a word-by-word reveal, scatter graphemes, …). Like `each()`, nothing executes
 * at play time: it snapshots the source's laid-out part geometry ONCE and emits
 * ordinary positioned nodes, so `evaluate()` stays a pure function of time and
 * the goldens hold by construction.
 *
 * SEPARATE entry point with its own budget (mirrors `each()`/`scene/layout`/
 * `scene/path`) — the base embed never pays for it.
 *
 * Authoring semantics (the blessed defaults):
 * - STATIC SNAPSHOT: part boxes are captured at build time from the source's
 *   measurer. Animating the source's width/fontSize after the split will NOT
 *   reflow the parts — the documented `each()` tradeoff. Re-`splitText()` on a
 *   changed source if you need a different layout.
 * - REPLACE the source: this returns the Group of parts to draw INSTEAD of the
 *   original Text. Don't also add the source to the scene, or it double-draws.
 */

import { Group, Text, type GraphemeBox, type LineBox, type TextProps, type WordBox } from './nodes.js';
import { fallbackMeasurer, quantize, type TextMeasurer } from './text.js';

export type SplitBy = 'word' | 'line' | 'grapheme';

export interface SplitTextOpts {
  /** What unit to split into. Default 'word'. */
  by?: SplitBy;
  /**
   * Stable id prefix for the wrapping group and its parts (`${id}/${i}`). When
   * omitted, falls back to the source Text's own `id` (and throws if neither is
   * set — a split needs a stable id namespace to bind tracks against).
   */
  id?: string;
  /**
   * The measurer to snapshot part geometry with. Defaults to the source's
   * injected measurer, then the process fallback — exactly the chain the other
   * Text geometry getters use.
   */
  measurer?: TextMeasurer;
}

/** One part of a split, in the source Text's draw space (group-local coords). */
export interface SplitPart {
  /** The part's text (a word, a full line, or a single grapheme). */
  text: string;
  /** The generated child node (a left-aligned Text positioned at the part). */
  node: Text;
  /** Laid-out line index the part came from. */
  line: number;
  /** Part ink box, in the source's draw space (== the child's group-local box). */
  box: { x: number; y: number; w: number; h: number };
}

export interface SplitTextResult {
  /** The wrapping group (`id`), positioned where the source sat — draw THIS. */
  node: Group;
  /** The generated part children, in reading order. */
  children: Text[];
  /** Per-part geometry + node, in reading order. */
  parts: SplitPart[];
}

export class SplitTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitTextError';
  }
}

/** The font props a part Text inherits from its source. */
interface SplitFont {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  fill: string;
  lineHeight: number;
}

/**
 * Expand a Text (instance or props) into a `Group` of positioned per-part child
 * Texts — one per word / line / grapheme. PURE build-time expansion to ordinary
 * nodes; the part geometry is a STATIC snapshot of the source's current layout.
 *
 *   const split = splitText(title, { by: 'word', id: 'title' });
 *   // scene children: [split.node]  (REPLACES the original title)
 *   // animate each word: split.children[i] / track('title/0/opacity', …)
 *
 * Stagger a word-by-word reveal by fanning a clip across `split.children`, or
 * compose with `tl.stagger` over the `${id}/${i}` ids.
 */
export function splitText(source: Text | TextProps, opts: SplitTextOpts = {}): SplitTextResult {
  const text = source instanceof Text ? source : new Text(source);
  const id = opts.id ?? text.id;
  if (id === undefined) {
    throw new SplitTextError(
      'splitText() needs a stable id — pass { id } or give the source Text an id (the parts bind tracks against ${id}/${i})',
    );
  }
  const by = opts.by ?? 'word';
  const m = opts.measurer ?? text.measurerSource?.() ?? fallbackMeasurer();

  const font: SplitFont = {
    fontFamily: text.fontFamily,
    fontSize: text.fontSize(),
    fontWeight: text.fontWeight,
    fontStyle: text.fontStyle,
    fill: text.fill(),
    lineHeight: text.lineHeight,
  };
  // The layout baseline of line i in draw space — the same grid Text.draw emits
  // fillText on (y: i*step). Independent of glyph ascent, so a part Text drawn
  // here lands its baseline EXACTLY where the source line's baseline sits.
  const step = quantize(font.fontSize * font.lineHeight);

  const boxes: { text: string; line: number; x: number; y: number; w: number; h: number }[] =
    by === 'line'
      ? text.lineBoxes(m).map((b: LineBox, i: number) => ({ text: b.text, line: i, x: b.x, y: b.y, w: b.w, h: b.h }))
      : by === 'word'
        ? text.wordBoxes(m).map((b: WordBox) => ({ text: b.text, line: b.line, x: b.x, y: b.y, w: b.w, h: b.h }))
        : text.graphemeBoxes(m).map((b: GraphemeBox) => ({ text: b.text, line: b.line, x: b.x, y: b.y, w: b.w, h: b.h }));

  const children: Text[] = [];
  const parts: SplitPart[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!;
    // Each part is a left-aligned Text whose baseline-left sits at the part's
    // draw-space (x, baseline) — fillText emits at local y=0, so position == the
    // line baseline (b.line * step), matching the source's own emit row.
    const node = new Text({
      id: `${id}/${i}`,
      text: b.text,
      fill: font.fill,
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      fontWeight: font.fontWeight,
      ...(font.fontStyle === 'italic' ? { fontStyle: 'italic' as const } : {}),
      lineHeight: font.lineHeight,
      align: 'left',
      position: [b.x, b.line * step],
    });
    children.push(node);
    parts.push({ text: b.text, node, line: b.line, box: { x: b.x, y: b.y, w: b.w, h: b.h } });
  }

  // The group sits where the source sat — a STATIC snapshot of position(), so
  // the parts share the source's draw-space origin (first baseline at the align
  // edge). Children carry draw-space coords relative to that origin.
  const [px, py] = text.position();
  const node = new Group({ id, children, position: [px, py] });

  return { node, children, parts };
}

// re-export the unit-box types so consumers of this entry can name part geometry
export type { GraphemeBox, LineBox, WordBox } from './nodes.js';

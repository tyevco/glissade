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
import type { FontSpec } from './displayList.js';
import { fallbackMeasurer, measureWrappedText, quantize, warnIfEstimating, type TextMeasurer } from './text.js';

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
  /**
   * The part's registered node id — `${id}/${i}`, the SAME string the child
   * Text was constructed with. Bind a track straight against it:
   * `parts.map((p) => p.id + '/revealFraction')` (or use `result.targets(prop)`).
   */
  id: string;
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
  /**
   * Ready-to-bind track targets — `[`${id}/0/${prop}`, `${id}/1/${prop}`, …]`
   * in reading order. The blessed kinetic-typography recipe is one line:
   * `tl.stagger(result.targets('revealFraction'), { from: 0, to: 1 }, { each: 0.1 })`.
   */
  targets(prop: string): string[];
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
  letterSpacing: number | undefined;
}

/**
 * Expand a Text (instance or props) into a `Group` of positioned per-part child
 * Texts — one per word / line / grapheme. PURE build-time expansion to ordinary
 * nodes; the part geometry is a STATIC snapshot of the source's current layout.
 *
 *   const split = splitText(title, { by: 'word', id: 'title', measurer });
 *   // scene children: [split.node]  (REPLACES the original title)
 *   // animate each word: split.targets('revealFraction') === ['title/0/revealFraction', …]
 *   tl.stagger(split.targets('revealFraction'), { from: 0, to: 1 }, { each: 0.1 });
 *
 * Bind tracks against `split.targets(prop)` (ready ids, reading order) or
 * `parts[i].id` / `parts[i].node` directly. `{ measurer }` is required for exact
 * part geometry — see the dev-warning footgun below.
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
  // Fail loud on an unknown `by` instead of silently falling through to the
  // grapheme branch below (the IIFE/JS footgun — TS already constrains it to
  // SplitBy, but a no-build caller can pass anything; `'char'`/`'zzz'` were
  // silently treated as graphemes). Same fail-loud class as the ctor guard.
  if (!(['word', 'line', 'grapheme'] as readonly string[]).includes(by)) {
    throw new SplitTextError(
      `splitText() got an unknown { by: ${JSON.stringify(by)} } — valid values are 'word', 'line', 'grapheme'.`,
    );
  }
  const m = opts.measurer ?? text.measurerSource?.() ?? fallbackMeasurer();
  // Silent footgun: with no real backend (split before setTextMeasurer, no
  // { measurer } passed) the part geometry is a rough per-character estimate
  // whose error accumulates left-to-right. Tell the author exactly why.
  warnIfEstimating(m, 'splitText');

  const font: SplitFont = {
    fontFamily: text.fontFamily,
    fontSize: text.fontSize(),
    fontWeight: text.fontWeight,
    fontStyle: text.fontStyle,
    fill: text.fill(),
    lineHeight: text.lineHeight,
    letterSpacing: text.letterSpacing,
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
    const partId = `${id}/${i}`;
    const node = new Text({
      id: partId,
      text: b.text,
      fill: font.fill,
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      fontWeight: font.fontWeight,
      ...(font.fontStyle === 'italic' ? { fontStyle: 'italic' as const } : {}),
      lineHeight: font.lineHeight,
      ...(font.letterSpacing !== undefined ? { letterSpacing: font.letterSpacing } : {}),
      align: 'left',
      position: [b.x, b.line * step],
    });
    children.push(node);
    parts.push({ id: partId, text: b.text, node, line: b.line, box: { x: b.x, y: b.y, w: b.w, h: b.h } });
  }

  // The group sits where the source sat — a STATIC snapshot of position(), so
  // the parts share the source's draw-space origin (first baseline at the align
  // edge). Children carry draw-space coords relative to that origin.
  const [px, py] = text.position();
  const node = new Group({ id, children, position: [px, py] });

  // Ready-to-bind targets in reading order — `${id}/${i}/${prop}` — so the
  // headline recipe is `tl.stagger(result.targets('revealFraction'), …)`. The
  // ids match parts[i].id (the child node's registered id) by construction.
  const targets = (prop: string): string[] => parts.map((p) => `${p.id}/${prop}`);

  return { node, children, parts, targets };
}

// ── fitText: shrink-to-fit + wrap-to-max-lines (0.35) ────────────────────────

export interface FitTextOpts {
  /** wrap/measure width (px). Required — text wraps to this and never exceeds it. */
  maxW: number;
  /** cap the wrapped height (px). Optional — combine with maxLines. */
  maxH?: number;
  /** cap the number of wrapped lines. Optional. */
  maxLines?: number;
  /** never shrink below this (px). Default 6. Below it, fitText throws (fail loud). */
  minPx?: number;
  /** if the text can't fit even at minPx: 'throw' (default) or 'clamp' to minPx. */
  onOverflow?: 'throw' | 'clamp';
  /** measurer for exact fit — pass one (or call setTextMeasurer first), else the
   *  estimating fallback is used with a one-time dev warning (the splitText footgun). */
  measurer?: TextMeasurer;
}

/** Build a measurement FontSpec for `text` at a candidate size (public fields only). */
function fontAt(text: Text, size: number): FontSpec {
  return {
    family: text.fontFamily,
    size,
    weight: text.fontWeight,
    ...(text.fontStyle === 'italic' ? { style: 'italic' as const } : {}),
    ...(text.letterSpacing !== undefined ? { letterSpacing: text.letterSpacing } : {}),
  };
}

/** True if `text` wraps within maxW to ≤ maxLines and ≤ maxH at this fontSize. */
function fits(text: Text, size: number, opts: FitTextOpts, m: TextMeasurer): boolean {
  const font = fontAt(text, size);
  const met = measureWrappedText(text.text(), font, opts.maxW, text.lineHeight, m);
  if (opts.maxLines !== undefined && met.lines.length > opts.maxLines) return false;
  if (opts.maxH !== undefined && met.height > opts.maxH) return false;
  // breakLines can't split a single long word, so a one-line result can still
  // overflow maxW — measureWrappedText reports `width: maxW`, hiding it. Check
  // each line's real ink width so an unbreakable token forces a smaller size.
  for (const line of met.lines) {
    if (m.measureText(line, font).width > opts.maxW + 0.5) return false;
  }
  return true;
}

/**
 * The largest integer-px fontSize ≤ the text's current size at which it fits the
 * box — via a binary search over `measureWrappedText` (pure, no runtime state).
 * The build-time answer to "shrink this to fit its container" the hand-rolled
 * shrink loops re-implemented per component.
 */
export function fitTextSize(text: Text, opts: FitTextOpts): number {
  const m = opts.measurer ?? text.measurerSource?.() ?? fallbackMeasurer();
  warnIfEstimating(m, 'fitText');
  const minPx = opts.minPx ?? 6;
  const hi = Math.max(minPx, Math.floor(text.fontSize()));
  if (fits(text, hi, opts, m)) return hi; // already fits at its authored size
  if (!fits(text, minPx, opts, m)) {
    if (opts.onOverflow === 'clamp') return minPx;
    throw new Error(
      `fitText: '${text.text().slice(0, 40)}${text.text().length > 40 ? '…' : ''}' does not fit ${opts.maxW}px` +
        `${opts.maxLines !== undefined ? ` in ${opts.maxLines} line(s)` : ''} even at minPx=${minPx} — ` +
        'raise maxW/maxLines/maxH, lower minPx, or pass { onOverflow: \'clamp\' }',
    );
  }
  // binary-search the largest fitting integer px in [minPx, hi]
  let lo = minPx;
  let best = minPx;
  let hiN = hi;
  while (lo <= hiN) {
    const mid = (lo + hiN) >> 1;
    if (fits(text, mid, opts, m)) {
      best = mid;
      lo = mid + 1;
    } else {
      hiN = mid - 1;
    }
  }
  return best;
}

/**
 * Shrink `text` to fit its box: sets its `fontSize` to `fitTextSize(...)` and
 * returns it (a plain `signal.set`, so a later explicit bind still wins — the
 * Grid()/splitText() mutate-and-return convention). Also sets `width` to maxW so
 * the node wraps to the same box it was fitted against.
 */
export function fitText(text: Text, opts: FitTextOpts): Text {
  const size = fitTextSize(text, opts);
  text.fontSize.set(size);
  text.width.set(opts.maxW);
  return text;
}

/**
 * Fit several texts to ONE shared size — the largest px at which EVERY text fits
 * its box — so a row/list of labels renders uniformly (kills the "same list, three
 * different sizes" ragged-headers bug). Each text may carry its own maxW; a single
 * `maxW` applies to all. Returns the shared size.
 */
export function fitTextGroup(texts: readonly Text[], opts: FitTextOpts): number {
  if (texts.length === 0) throw new Error('fitTextGroup needs at least one text');
  // the group size is the MIN of each text's individual max-fit (clamp so one
  // un-fittable text pins the group to minPx rather than throwing mid-scan)
  const shared = Math.min(...texts.map((t) => fitTextSize(t, { ...opts, onOverflow: 'clamp' })));
  for (const t of texts) {
    t.fontSize.set(shared);
    t.width.set(opts.maxW);
  }
  return shared;
}

// re-export the unit-box types so consumers of this entry can name part geometry
export type { GraphemeBox, LineBox, WordBox } from './nodes.js';

/**
 * `@glissade/scene/caption-split` — `splitToFit()`: break a string into sequential
 * pieces each of which WRAPS to at most `maxLines` within a target width at a given
 * font, splitting ONLY at meaningful boundaries (per-locale **sentence → clause →
 * word**, the highest present that yields a fit). The measured, band-aware answer
 * to "this text is too long for the caption band" — NOT the `length×0.52` char-count
 * guess the 0.67 measurer-fail-loud work killed.
 *
 * SEPARATE entry point with its own budget (mirrors `scene/type`/`scene/path`) — the
 * base embed never pays for it.
 *
 * Two disciplines this module bakes:
 * - **Boundaries operate on ORIGINAL-STRING SLICES** (a piece is a slice of the input,
 *   re-joined by concatenation), so whitespace/punctuation are preserved EXACTLY and
 *   the split is locale-agnostic — never a `' '.join(words)` that would fabricate
 *   spaces into zh (which has none) or drop a glued mark.
 * - **MEASURE-CONSISTENCY (one-measure-N-consumers):** the split's fit decision is a
 *   promise a DIFFERENT consumer (the render) must honor — a piece judged "fits" that
 *   the render then overflows would make the whole guarantee a lie. So the fit uses a
 *   REAL measurer via the 0.67 `resolveMeasurer` chokepoint (fail-loud without), and
 *   `estimate: true` is a LOUDLY-caveated escape hatch (see {@link SplitToFitOpts}),
 *   not the benign self-contained opt-in `splitText` gets. The caller must measure at
 *   the SAME font/width/maxLines the render lays out with (pass the min-legible font).
 */

import type { FontSpec } from './displayList.js';
import { breakLines, MeasurerRequiredError, quantize, resolveMeasurer, type TextMeasurer } from './text.js';

// re-exported here so a consumer of this subpath can `catch (e instanceof
// MeasurerRequiredError)` (a no-real-measurer split throws it) without importing
// the base scene index.
export { MeasurerRequiredError };

/**
 * Thrown when a SINGLE word/token is too wide to fit the target width even at the
 * given (min-legible) font — it cannot be split further, so the author must
 * intervene rather than the split silently degrading legibility or dropping words.
 * Names the offending token + the fixes in priority order (reword the token FIRST —
 * it is almost always a URL / long compound the author should shorten; widening the
 * band or lowering the min font trade the legibility the split exists to protect, so
 * they come last).
 */
export class TextFitError extends Error {
  constructor(
    readonly token: string,
    readonly maxWidth: number,
    readonly fontSize: number,
  ) {
    super(
      `splitToFit: the token ${JSON.stringify(token)} is too wide to fit ${maxWidth}px at ${fontSize}px and ` +
        `cannot be split further — reword/shorten the token, or (last resort, trades legibility) widen the ` +
        `band width or lower the minimum font size.`,
    );
    this.name = 'TextFitError';
  }
}

export interface SplitToFitOpts {
  /** Target wrap width in px (the caption band width). */
  maxWidth: number;
  /**
   * The font to measure + wrap at. Pass the MIN-LEGIBLE font (the shrink floor) so
   * the pieces are guaranteed to fit even at the smallest size the render may use —
   * the render's auto-shrink then lands at a font ≥ this that still fits.
   */
  font: FontSpec;
  /** Lines a piece may wrap to before it must split further. Default 2. */
  maxLines?: number;
  /**
   * The measurer for the fit decision. Defaults to the process fallback. MUST be the
   * SAME measurer the render lays out with (measure-consistency) — else a piece judged
   * "fits" can overflow at render.
   */
  measurer?: TextMeasurer;
  /**
   * measurer-fail-loud OPT-OUT — and a STRONGER caveat than `splitText`'s. The split
   * decides "this piece fits the band", a promise the RENDER must honor; an
   * estimate-split (`length×0.52`) rendered with real metrics MAY OVERFLOW the band.
   * So by default no real measurer THROWS `MeasurerRequiredError`; `estimate: true`
   * accepts the rough estimate AND the overflow risk (pieces fit only if the render
   * also estimates — pass a real measurer for a guaranteed fit). Default false.
   */
  estimate?: boolean;
  /**
   * BCP-47 locale for boundary detection (sentence + word `Intl.Segmenter`). Threads
   * to the segmenter so zh 。！？ sentence marks and space-less word boundaries are
   * detected correctly. Default: the host default locale.
   */
  locale?: string;
}

// Sentence + word segmenters are locale-keyed (zh sentence/word boundaries differ
// from en) and cached per (granularity, locale) — Intl.Segmenter construction isn't
// free. Same Intl.Segmenter discipline as segmentWords; ICU per-engine differences
// are in the §5.5 determinism scope (the goldens run on the pinned Node ICU).
const segmenterCache = new Map<string, Intl.Segmenter | null>();
function getSegmenter(granularity: 'sentence' | 'word', locale: string | undefined): Intl.Segmenter | null {
  const cacheKey = `${granularity}:${locale ?? ''}`;
  let seg = segmenterCache.get(cacheKey);
  if (seg === undefined) {
    seg =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter(locale, { granularity })
        : null;
    segmenterCache.set(cacheKey, seg);
  }
  return seg;
}

// Clause punctuation covering EN (, ; : —) and ZH (， ； 、 ： —). The union is safe:
// clause breaks are SOFT (over-inclusion just offers more candidate break points the
// band-fit filters by width). The delimiter stays attached to the PRECEDING clause
// (a break AFTER the punctuation) so the re-join tiles the original exactly.
const CLAUSE_RE = /([,;:—，；、：]+)/;

// Ordered substrings that CONCATENATE back to `text` (so re-join is exact + locale-
// agnostic). `Intl.Segmenter` handles sentence terminals in context — abbreviations
// (`Dr.`), decimals (`$48,214`), and the ellipsis `…` (a mid-thought pause, NOT a
// sentence end) do not mis-split, and `!?`/`?!` do. The regex fallbacks below are a
// best-effort safety net for the (rare) Segmenter-less engine.
function segmentsAt(text: string, level: 'sentence' | 'clause' | 'word', locale: string | undefined): string[] {
  if (level === 'clause') {
    const parts = text.split(CLAUSE_RE);
    const out: string[] = [];
    // parts alternate [chunk, delim, chunk, delim, …]; glue each delim onto its chunk
    for (let i = 0; i < parts.length; i += 2) {
      const glued = (parts[i] ?? '') + (parts[i + 1] ?? '');
      if (glued !== '') out.push(glued);
    }
    return out.length > 0 ? out : [text];
  }
  const seg = getSegmenter(level, locale);
  if (seg) return [...seg.segment(text)].map((s) => s.segment);
  // Segmenter-less fallback: sentence ~ terminal runs (ASCII . ! ? + zh 。！？; the
  // ellipsis char … is excluded — it is not in the class); word ~ whitespace-kept.
  if (level === 'sentence') {
    const parts = text.split(/([.!?]+|[。！？]+)/);
    const out: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
      const glued = (parts[i] ?? '') + (parts[i + 1] ?? '');
      if (glued !== '') out.push(glued);
    }
    return out.length > 0 ? out : [text];
  }
  return text.split(/(\s+)/).filter((w) => w.length > 0);
}

/**
 * Split `text` into sequential pieces each of which wraps to ≤ `maxLines` within
 * `maxWidth` at `font`. Splits at the highest-priority boundary present (sentence →
 * clause → word), greedily packing units into as-large-as-fits pieces. Throws
 * {@link TextFitError} if a single word can't fit even alone (unsplittable). A text
 * that already fits returns `[text.trim()]` (single piece) — so a short caption is a
 * no-op. Pure: same inputs → same pieces (given the same measurer).
 */
export function splitToFit(text: string, opts: SplitToFitOpts): string[] {
  const m = resolveMeasurer(opts.measurer, undefined, 'splitToFit', opts.estimate);
  const maxLines = Math.max(1, opts.maxLines ?? 2);
  const { maxWidth, font, locale } = opts;
  // A piece "fits" iff it wraps to ≤ maxLines AND no wrapped line's INK exceeds the
  // band. The line-count check alone is NOT enough: breakLines gives an over-wide
  // single word its own line (no intra-word break), so a too-wide token would read
  // as "1 line = fits" and silently overflow — the same footgun fitText hit (0.35).
  // The per-line ink guard is what makes an unsplittable word fail loud below.
  const fits = (s: string): boolean => {
    const lines = breakLines(s, font, maxWidth, m);
    if (lines.length > maxLines) return false;
    for (const ln of lines) if (quantize(m.measureText(ln, font).width) > maxWidth) return false;
    return true;
  };

  const LEVELS = ['sentence', 'clause', 'word'] as const;

  const rec = (chunk: string, fromLevel: number): string[] => {
    const trimmed = chunk.trim();
    if (trimmed === '') return [];
    if (fits(trimmed)) return [trimmed];
    for (let level = fromLevel; level < LEVELS.length; level++) {
      const units = segmentsAt(chunk, LEVELS[level]!, locale);
      if (units.length <= 1) continue; // this level doesn't split it — go finer
      const out: string[] = [];
      let buf = '';
      for (const u of units) {
        if (fits((buf + u).trim())) {
          buf += u;
          continue;
        }
        if (buf.trim() !== '') {
          out.push(buf.trim());
          buf = '';
        }
        if (fits(u.trim())) {
          buf = u;
        } else {
          // this single unit overflows even alone → split it at a FINER level
          for (const piece of rec(u, level + 1)) out.push(piece);
        }
      }
      if (buf.trim() !== '') out.push(buf.trim());
      if (out.length > 0) return out;
    }
    // no boundary split it and it still overflows → an unsplittable token (a word)
    throw new TextFitError(trimmed, maxWidth, font.size);
  };

  return rec(text, 0);
}

/**
 * Text measurement + line breaking (DESIGN.md §3.6). Shaping is delegated to
 * the canvas implementation; line breaking is OURS, driven by the injected
 * TextMeasurer so the breaker always measures with the rasterizer that will
 * draw. Layout-feeding measurements are quantized (0.5px) so sub-pixel
 * advance drift between Skia/HarfBuzz versions cannot move whole layouts.
 */

import { emitDevWarning } from '@glissade/core';
import { type FontSpec } from './displayList.js';

export interface TextMetricsLite {
  width: number;
  ascent: number;
  descent: number;
}

export interface TextMeasurer {
  measureText(text: string, font: FontSpec): TextMetricsLite;
}

/**
 * §3.6 measurement quantum (px). Scene-owned pre-measure quantizes every
 * layout-feeding advance to this grid ONCE, then hands Yoga frozen integers —
 * so sub-pixel measureText drift between Skia/HarfBuzz versions cannot move a
 * whole layout. The single source of truth for the grid; `quantize` rounds to
 * it. (Yoga's `setMeasureFunc` was considered and rejected — see DESIGN.md §3.6.)
 */
export const MEASURE_QUANTUM_PX = 0.5;

/** §3.6 measurement quantum — round to the MEASURE_QUANTUM_PX grid. */
export function quantize(v: number): number {
  return Math.round(v / MEASURE_QUANTUM_PX) * MEASURE_QUANTUM_PX;
}

/**
 * FAIL LOUD on a non-measurable FontSpec (§0.24 fail-loud sweep). A `size` that
 * isn't a finite positive number silently yields NaN/0 metrics in the estimating
 * measurers (and a wrong-font fallback in the real backends) → zero-height layout
 * boxes, broken wrapping/reveal, all with NO error — the silent-wrong-result class
 * an agent can't glance-test. The common cause is the field name: the FontSpec
 * field is `size`, NOT `fontSize` (that is the Text node prop). The single guard
 * every measurement entry point (breakLines, measureWrappedText, the backend
 * `measureText`s) routes through, so the contract is enforced uniformly.
 */
export function assertFiniteFontSize(font: FontSpec, where: string): void {
  if (typeof font.size !== 'number' || !Number.isFinite(font.size) || font.size <= 0) {
    throw new Error(
      `${where}: font.size must be a positive number (got ${JSON.stringify(font.size)}). ` +
        'The FontSpec field is `size`, not `fontSize` (that is the Text node prop) — pass `{ family, size }`.',
    );
  }
}

/**
 * Estimating fallback measurer — used only when no backend has been injected
 * (e.g. evaluating for IR-level tests). Deterministic but not metrically
 * faithful; mount(), the CLI, and exporters always inject the real one.
 */
let defaultMeasurer: TextMeasurer | null = null;

/**
 * Process-wide fallback measurer for FACTORY-TIME measurement — component
 * factories run before any scene exists, so Text pulls (measuredSize,
 * lineBoxes, wordBoxes) and createScene fall back here before the estimator.
 * Node consumers: `setDefaultMeasurer(createMeasurer({ fonts }))` from
 * @glissade/backend-skia gives factory code the rasterizer's real metrics.
 * Scene-injected measurers (mount/CLI/golden harness) always win.
 */
export function setDefaultMeasurer(m: TextMeasurer | null): void {
  defaultMeasurer = m;
}

/** The default-or-estimating chain end; internal fallback for measurer pulls. */
export function fallbackMeasurer(): TextMeasurer {
  return defaultMeasurer ?? estimatingMeasurer;
}

export const estimatingMeasurer: TextMeasurer = {
  measureText(text, font) {
    return {
      width: text.length * font.size * 0.52,
      ascent: font.size * 0.8,
      descent: font.size * 0.2,
    };
  },
};

/**
 * True when `m` is the per-character ESTIMATING fallback (the module singleton)
 * — i.e. no real backend measurer and no registered `defaultMeasurer` was
 * available. Identity-compare so a real backend or a `setDefaultMeasurer`-
 * registered measurer never trips it.
 */
export function isEstimatingMeasurer(m: TextMeasurer): boolean {
  return m === estimatingMeasurer;
}

const warnedEstimate = new Set<string>();

/**
 * Thrown by a measurer-requiring helper (`splitText`/`fitText`) when it resolved
 * to the estimating fallback AND the caller opted into fail-loud
 * (`requireMeasurer: true`, 0.59 measurer fail-loud). The default stays
 * warn-once (below) — this is the opt-in that turns the silent geometry
 * DEGRADATION into a hard error for pipelines that need exact layout.
 */
export class MeasurerRequiredError extends Error {
  constructor(site: string) {
    super(
      `${site}: no real text measurer available and { requireMeasurer: true } was set — part geometry ` +
        'would use a rough per-character estimate. Pass { measurer } or call setTextMeasurer()/setDefaultMeasurer() first.',
    );
    this.name = 'MeasurerRequiredError';
  }
}

/**
 * One-shot dev-warning when a build-time geometry getter resolved its measurer
 * to the rough per-character estimate (no backend, no `setDefaultMeasurer`).
 * `site` keys the de-dupe so each distinct caller warns at most once. Silent
 * when a real measurer is in play — the estimate is the only footgun here.
 *
 * 0.59: pass `strict` to make the same fallback FAIL LOUD ({@link
 * MeasurerRequiredError}) instead of warn-once — the `requireMeasurer` opt-in on
 * splitText/fitText. Default (`strict` falsy) preserves the exact prior
 * warn-once behavior (byte/behavior-neutral).
 */
export function warnIfEstimating(m: TextMeasurer, site: string, strict = false): void {
  if (!isEstimatingMeasurer(m)) return;
  if (strict) throw new MeasurerRequiredError(site);
  if (warnedEstimate.has(site)) return;
  warnedEstimate.add(site);
  emitDevWarning(
    `${site}: no text measurer available — using a rough per-character estimate; ` +
      'pass { measurer } or call after setTextMeasurer()/setDefaultMeasurer() for exact layout.',
  );
}

/**
 * Test-only: clear the one-shot de-dupe so the estimate warning can re-assert.
 * @internal
 */
export function __resetEstimateWarnings(): void {
  warnedEstimate.clear();
}

// Segmentation via Intl.Segmenter when available (correct CJK/emoji word
// boundaries — the pretext approach); whitespace regex as fallback. ICU
// differences are per-engine, consistent with the §5.5 determinism scope.
let wordSegmenter: Intl.Segmenter | null | undefined;

/**
 * The draw-path word segmentation (Intl.Segmenter boundaries, punctuation
 * glued to its predecessor) — exported so Text.wordBoxes() boxes EXACTLY the
 * units the breaker flows.
 */
export function segmentWords(text: string): string[] {
  if (wordSegmenter === undefined) {
    wordSegmenter =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter(undefined, { granularity: 'word' })
        : null;
  }
  if (wordSegmenter) {
    const raw = [...wordSegmenter.segment(text)].map((s) => s.segment);
    // no break before punctuation: glue punctuation-only segments (no
    // letters/digits/whitespace) to their predecessor — 'replay,' stays one
    // unit, and CJK closing marks hang on their preceding character
    const glued: string[] = [];
    for (const seg of raw) {
      if (glued.length > 0 && /^[^\p{L}\p{N}\s]+$/u.test(seg)) {
        glued[glued.length - 1] += seg;
      } else {
        glued.push(seg);
      }
    }
    return glued;
  }
  return text.split(/(\s+)/).filter((w) => w.length > 0);
}

// Per-grapheme segmentation — the unit the typewriter reveal advances over, so
// emoji/ZWJ sequences and combining marks stay whole (a flag or 'é' is one
// keystroke, not two). Same Intl.Segmenter discipline as segmentWords; falls
// back to Array.from (code points) where Segmenter is absent.
let graphemeSegmenter: Intl.Segmenter | null | undefined;

/**
 * Split text into graphemes (user-perceived characters). Exported so Text.draw
 * (reveal masking), Text.graphemes() (authoring), and revealSchedule() (the SFX
 * keystroke contract) all count the SAME units.
 */
export function segmentGraphemes(text: string): string[] {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
  }
  if (graphemeSegmenter) {
    return [...graphemeSegmenter.segment(text)].map((s) => s.segment);
  }
  return Array.from(text);
}

/**
 * Greedy line breaking: explicit '\n' always breaks; otherwise word segments
 * flow until maxWidth is exceeded (Intl.Segmenter boundaries, so CJK wraps
 * without spaces). A segment wider than maxWidth gets its own line (no
 * intra-word breaking in v1).
 */
export function breakLines(
  text: string,
  font: FontSpec,
  maxWidth: number | undefined,
  measurer: TextMeasurer,
): string[] {
  // The measurement chokepoint — intrinsicSize / lineBoxes / wordBoxes / drawOffset
  // / measureWrappedText all wrap through here, so one guard fails loud on a
  // non-measurable FontSpec instead of cascading NaN/0 metrics into the layout.
  assertFiniteFontSize(font, 'breakLines');
  const paragraphs = text.split('\n');
  if (maxWidth === undefined || maxWidth <= 0) return paragraphs;

  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = segmentWords(para);
    let line = '';
    for (const word of words) {
      const candidate = line + word;
      if (line !== '' && quantize(measurer.measureText(candidate.trimEnd(), font).width) > maxWidth) {
        lines.push(line.trimEnd());
        line = word.trimStart() === '' ? '' : word;
      } else {
        line = candidate;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Wrapped-text metrics: the box a string occupies when wrapped to `width`,
 *  plus the laid-out lines — so a consumer can size a container (bubble/card)
 *  to wrapped text WITHOUT a Text node or re-implementing line breaking. */
export interface WrappedTextMetrics {
  /** Box width: the wrap `width` when wrapping, else the widest line's ink. */
  width: number;
  /** The wrapped lines (the SAME breaks the renderer draws — `breakLines`). */
  lines: string[];
  /** Box height: `quantize(fontSize * lineHeight) * lineCount` (the draw grid). */
  height: number;
  /** Max line ascent above the first baseline (font metric; for baseline align). */
  ascent: number;
  /** Max line descent below the baseline. */
  descent: number;
}

/**
 * Measure how `text` wraps to `width` with `font`, returning `{ width, lines,
 * height, ascent, descent }` — the node-free analogue of `Text.measuredSize`/
 * `lineBoxes`, for sizing a container to wrapped text. Reuses {@link breakLines}
 * + the injected `measurer` (so breaks match what the rasterizer draws) — the
 * exact `Text.intrinsicSize` steps. `width <= 0` = no wrap (only explicit '\n').
 * `lineHeight` is a multiple of `font.size` (it lives on the Text node, not
 * `FontSpec`, so it's a parameter here).
 */
export function measureWrappedText(
  text: string,
  font: FontSpec,
  width: number,
  lineHeight: number,
  measurer: TextMeasurer,
): WrappedTextMetrics {
  // FAIL LOUD on a non-measurable size (height would be NaN → null over JSON);
  // the shared guard (also enforced in breakLines) names the size-vs-fontSize gotcha.
  assertFiniteFontSize(font, 'measureWrappedText');
  const lines = breakLines(text, font, width > 0 ? width : undefined, measurer);
  let widest = 0;
  let ascent = 0;
  let descent = 0;
  for (const line of lines) {
    const m = measurer.measureText(line, font);
    const w = quantize(m.width);
    if (w > widest) widest = w;
    if (m.ascent > ascent) ascent = m.ascent;
    if (m.descent > descent) descent = m.descent;
  }
  return {
    width: width > 0 ? width : widest,
    lines,
    height: quantize(font.size * lineHeight) * lines.length,
    ascent,
    descent,
  };
}

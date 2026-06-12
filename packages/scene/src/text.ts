/**
 * Text measurement + line breaking (DESIGN.md §3.6). Shaping is delegated to
 * the canvas implementation; line breaking is OURS, driven by the injected
 * TextMeasurer so the breaker always measures with the rasterizer that will
 * draw. Layout-feeding measurements are quantized (0.5px) so sub-pixel
 * advance drift between Skia/HarfBuzz versions cannot move whole layouts.
 */

import { type FontSpec } from './displayList.js';

export interface TextMetricsLite {
  width: number;
  ascent: number;
  descent: number;
}

export interface TextMeasurer {
  measureText(text: string, font: FontSpec): TextMetricsLite;
}

/** §3.6 measurement quantum. */
export function quantize(v: number): number {
  return Math.round(v * 2) / 2;
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

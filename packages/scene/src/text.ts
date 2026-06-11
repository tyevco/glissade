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
 * Greedy line breaking: explicit '\n' always breaks; otherwise words flow
 * until maxWidth is exceeded. A word wider than maxWidth gets its own line
 * (no intra-word breaking in v1).
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
    const words = para.split(/(\s+)/).filter((w) => w.length > 0);
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

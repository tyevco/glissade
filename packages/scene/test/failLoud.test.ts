/**
 * The 0.24 comprehensive fail-loud sweep — regression guards for the measureText /
 * font.size contract. A non-finite/non-positive `font.size` previously cascaded
 * NaN/0 metrics into zero-height layout boxes (broken wrapping/reveal) with NO
 * error — the silent-wrong-result class an agent can't glance-test. Now every
 * measurement entry point (the breakLines chokepoint + the three backend
 * measureTexts) fails loud, naming the common `size`-vs-`fontSize` gotcha.
 *
 * Audit trail — these audited candidates were VERIFIED NOT bugs (the plan's
 * "verify before changing"), so they get no guard:
 *  - core/track.ts findSegment returns the SEGMENT INDEX 0 (before the first key);
 *    the caller clamps to keys[0].value, and the offset-sampler returns the
 *    type-correct vt.scale(vt.sub(...)) zero — correct for vec2/color/number.
 *  - scene/grid.ts: cellHeight is genuinely optional for a SINGLE row (no pitch
 *    needed); only >1 row throws — correct.
 *  - empty text → {w:0,h:0} / measureText 0 metrics is correct (no glyphs).
 *  - gradient flat-stops / rng endpoint: degenerate-but-defined, not footguns.
 */
import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { assertFiniteFontSize, breakLines, createScene, estimatingMeasurer, evaluate } from '../src/index.js';
import { Text } from '../src/nodes.js';

describe('fail-loud: the measureText / font.size contract (0.24 sweep)', () => {
  const bad = [Number.NaN, 0, -10, Number.POSITIVE_INFINITY];

  it('assertFiniteFontSize throws on every non-finite/non-positive size, naming the size-vs-fontSize gotcha', () => {
    for (const size of bad) {
      expect(() => assertFiniteFontSize({ family: 'X', size }, 'site'), `size=${size}`).toThrow(
        /font\.size must be a positive number.*`size`, not `fontSize`/s,
      );
    }
    expect(() => assertFiniteFontSize({ family: 'X', size: 16 }, 'site')).not.toThrow();
  });

  it('breakLines (the wrap chokepoint) fails loud — this covers intrinsicSize/lineBoxes/wordBoxes/measureWrappedText', () => {
    expect(() => breakLines('hi there world', { family: 'X', size: Number.NaN }, 40, estimatingMeasurer)).toThrow(/breakLines: font\.size/);
    // a valid size still wraps (the happy path is untouched → goldens byte-identical)
    expect(breakLines('hi there world wraps', { family: 'X', size: 16 }, 60, estimatingMeasurer).length).toBeGreaterThan(1);
  });

  it('evaluating a Text with a NaN fontSize throws instead of silently rendering zero-height', () => {
    const t = new Text({ text: 'hi', fontFamily: 'X', fontSize: Number.NaN });
    expect(() => evaluate(createScene({ size: { w: 100, h: 50 }, children: [t] }), timeline(() => {}), 0)).toThrow(/font\.size/);
  });
});

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
import { Rect, Text } from '../src/nodes.js';

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

describe('fail-loud: malformed static Paint fill at construction (0.51 — the common gradient-authoring path)', () => {
  // Before this guard, a typo'd static fill bypassed paintType.validate (which was
  // only wired into validateTrack) and failed cryptically & inconsistently per
  // backend — canvas2d "s is not iterable", Skia shader failure, DOM silent-wrong.
  // Now `new Rect({ fill })` fails loud at construction with a clean PaintError.
  it('throws on an unknown/typo\'d paint kind (the reported case)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new Rect({ width: 10, height: 10, fill: { kind: 'radialgradient' } as any })).toThrow(
      /unknown paint kind 'radialgradient'.*color \| linear \| radial \| mesh/,
    );
  });

  it('throws on an empty stops array (linear/radial) and empty mesh points', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new Rect({ width: 10, height: 10, fill: { kind: 'radial', stops: [] } as any })).toThrow(/requires a non-empty .?stops/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new Rect({ width: 10, height: 10, fill: { kind: 'linear', stops: [] } as any })).toThrow(/requires a non-empty .?stops/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new Rect({ width: 10, height: 10, fill: { kind: 'mesh', points: [] } as any })).toThrow(/requires a non-empty .?points/);
  });

  it('throws on a kind-less object', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new Rect({ width: 10, height: 10, fill: { stops: [{ offset: 0, color: '#fff' }] } as any })).toThrow(/kind/);
  });

  it('a valid static gradient and a plain color string construct fine (happy path untouched → goldens byte-identical)', () => {
    expect(
      () =>
        new Rect({
          width: 10,
          height: 10,
          fill: { kind: 'radial', stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }], center: [40, 0], radius: 30 },
        }),
    ).not.toThrow();
    expect(() => new Rect({ width: 10, height: 10, fill: '#f0f' })).not.toThrow();
    // a `() => Paint` binding is resolved per-frame (validateTrack path), not at construction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new Rect({ width: 10, height: 10, fill: (() => ({ kind: 'radialgradient' })) as any })).not.toThrow();
  });
});

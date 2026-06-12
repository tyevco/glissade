import { describe, expect, it } from 'vitest';
import type { EaseSpec, Key, Track, Vec2 } from '@glissade/core';
import { importLottie } from '../src/index.js';
import { doc, shapeLayer, triangleSh, redFill } from './helpers.js';

const trackFor = (tracks: Track[], target: string): Track => {
  const tr = tracks.find((t) => t.target === target);
  expect(tr, `track '${target}'`).toBeDefined();
  return tr!;
};

describe('keyframe conversion', () => {
  it('shifts the Lottie DEPARTING ease onto the glissade ARRIVING key', () => {
    const layer = shapeLayer([triangleSh(), redFill], {
      r: {
        a: 1,
        k: [
          { t: 0, s: [0], o: { x: [0.4], y: [0.1] }, i: { x: [0.6], y: [0.9] } },
          { t: 25, s: [90] },
        ],
      },
    });
    const result = importLottie(doc([layer]));
    const tr = trackFor(result.timeline.tracks, 'L/rotation');
    const keys = tr.keys as Key<number>[];
    expect(keys[0]!.ease).toBeUndefined(); // first key never carries a segment shape
    expect(keys[1]!.ease).toEqual({ kind: 'cubicBezier', pts: [0.4, 0.1, 0.6, 0.9] } satisfies EaseSpec);
    expect(keys[1]!.value).toBe(90);
  });

  it('symmetric handles (x = y) are the identity curve and stay linear', () => {
    const layer = shapeLayer([triangleSh(), redFill], {
      r: {
        a: 1,
        k: [
          { t: 0, s: [0], o: { x: [0.167], y: [0.167] }, i: { x: [0.833], y: [0.833] } },
          { t: 25, s: [90] },
        ],
      },
    });
    const result = importLottie(doc([layer]));
    const keys = trackFor(result.timeline.tracks, 'L/rotation').keys;
    expect(keys[1]!.ease).toBeUndefined();
  });

  it('converts frames to seconds via the document fr, including the layer st shift', () => {
    const layer = shapeLayer(
      [triangleSh(), redFill],
      {
        r: {
          a: 1,
          k: [
            { t: 0, s: [0], o: { x: [0.4], y: [0] }, i: { x: [0.6], y: [1] } },
            { t: 10, s: [90] },
          ],
        },
      },
      { st: 5 },
    );
    const result = importLottie(doc([layer]));
    const keys = trackFor(result.timeline.tracks, 'L/rotation').keys;
    expect(keys[0]!.t).toBeCloseTo(5 / 25, 10);
    expect(keys[1]!.t).toBeCloseTo(15 / 25, 10);
    expect(result.timeline.fps).toBe(25);
    expect(result.timeline.duration).toBeCloseTo(2, 10);
  });

  it("h:1 becomes interp:'hold' on the following key", () => {
    const layer = shapeLayer([triangleSh(), redFill], {
      r: {
        a: 1,
        k: [
          { t: 0, s: [0], h: 1 },
          { t: 25, s: [90] },
        ],
      },
    });
    const result = importLottie(doc([layer]));
    const keys = trackFor(result.timeline.tracks, 'L/rotation').keys;
    expect(keys[1]!.interp).toBe('hold');
    expect(keys[1]!.ease).toBeUndefined();
  });

  it('same-frame double keys get the 1 ms nudge and a hold arrival', () => {
    const layer = shapeLayer([triangleSh(), redFill], {
      r: {
        a: 1,
        k: [
          { t: 0, s: [0] },
          { t: 10, s: [45] },
          { t: 10, s: [90] },
          { t: 20, s: [180] },
        ],
      },
    });
    const result = importLottie(doc([layer]));
    const keys = trackFor(result.timeline.tracks, 'L/rotation').keys as Key<number>[];
    expect(keys.map((k) => k.value)).toEqual([0, 45, 90, 180]);
    expect(keys[2]!.t).toBeCloseTo(0.4 + 0.001, 10);
    expect(keys[2]!.interp).toBe('hold');
    expect(keys[3]!.t).toBeCloseTo(0.8, 10);
  });

  it('resolves old-format s/e pairs: a trailing {t}-only key takes the previous e', () => {
    const layer = shapeLayer([triangleSh(), redFill], {
      r: {
        a: 1,
        k: [
          { t: 0, s: [0], e: [90], o: { x: [0.4], y: [0] }, i: { x: [0.6], y: [1] } },
          { t: 25 },
        ],
      },
    });
    const result = importLottie(doc([layer]));
    const keys = trackFor(result.timeline.tracks, 'L/rotation').keys as Key<number>[];
    expect(keys[1]!.value).toBe(90);
  });

  it('splits vec2 tracks with per-dimension eases into component number tracks', () => {
    const layer = shapeLayer([triangleSh(), redFill], {
      s: {
        a: 1,
        k: [
          { t: 0, s: [100, 100], o: { x: [0.1, 0.5], y: [0, 0] }, i: { x: [0.9, 0.5], y: [1, 1] } },
          { t: 25, s: [200, 300] },
        ],
      },
    });
    const result = importLottie(doc([layer]));
    const sx = trackFor(result.timeline.tracks, 'L/scale.x').keys as Key<number>[];
    const sy = trackFor(result.timeline.tracks, 'L/scale.y').keys as Key<number>[];
    expect(sx[1]!.value).toBeCloseTo(2);
    expect(sy[1]!.value).toBeCloseTo(3);
    expect(sx[1]!.ease).toEqual({ kind: 'cubicBezier', pts: [0.1, 0, 0.9, 1] });
    expect(sy[1]!.ease).toEqual({ kind: 'cubicBezier', pts: [0.5, 0, 0.5, 1] });
  });

  it('bakes spatial ti/to position segments densely with arc-length parameterization', () => {
    // quarter-circle-ish curve: ease maps to DISTANCE along the curve, so the
    // midpoint in time sits at half the arc length, not at bezier u = 0.5
    const layer = shapeLayer(
      [triangleSh(), redFill],
      {
        p: {
          a: 1,
          k: [
            { t: 0, s: [0, 0], to: [50, 0], ti: [0, -50] },
            { t: 50, s: [100, 100] },
          ],
        },
      },
      { op: 100 },
    );
    const result = importLottie(doc([layer], { fr: 50, op: 100 }));
    const keys = trackFor(result.timeline.tracks, 'L/position').keys as Key<Vec2>[];
    expect(keys.length).toBeGreaterThan(20); // dense at 50 fps over 1s
    expect(keys[0]!.value).toEqual([0, 0]);
    expect(keys[keys.length - 1]!.value).toEqual([100, 100]);
    // halfway in time = halfway in arc length (linear ease): on this symmetric
    // curve that is the point where x-progress equals y-progress
    const mid = keys.find((k) => Math.abs(k.t - 0.5) < 1e-9)!;
    expect(mid).toBeDefined();
    expect(mid.value[0] + mid.value[1]).toBeCloseTo(100, 0); // symmetry: x + y = 100 at the arc midpoint
    // monotone progress along the curve
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i]!.value[0]).toBeGreaterThanOrEqual(keys[i - 1]!.value[0]);
    }
  });

  it('plain (non-spatial) position keys convert directly with their cubicBezier ease', () => {
    const layer = shapeLayer([triangleSh(), redFill], {
      p: {
        a: 1,
        k: [
          { t: 0, s: [0, 0], to: [0, 0], ti: [0, 0], o: { x: 0.4, y: 0.1 }, i: { x: 0.6, y: 0.9 } },
          { t: 25, s: [100, 100] },
        ],
      },
    });
    const result = importLottie(doc([layer]));
    const keys = trackFor(result.timeline.tracks, 'L/position').keys as Key<Vec2>[];
    expect(keys).toHaveLength(2);
    expect(keys[1]!.ease).toEqual({ kind: 'cubicBezier', pts: [0.4, 0.1, 0.6, 0.9] });
  });
});

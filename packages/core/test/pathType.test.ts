import { beforeEach, describe, expect, it } from 'vitest';
import {
  getValueType,
  inferValueType,
  key,
  sampleTrack,
  setDevWarning,
  spring,
  track,
  type PathValue,
  type Track,
} from '../src/index.js';

let warnings: string[] = [];
beforeEach(() => {
  warnings = [];
  setDevWarning((m) => warnings.push(m));
});

const square = (s: number): PathValue => [
  {
    closed: true,
    v: [
      [-s, -s],
      [s, -s],
      [s, s],
      [-s, s],
    ],
    in: [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    out: [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  },
];

describe("the 'path' value type (§2.2, Lottie S0)", () => {
  const vt = getValueType<PathValue>('path');

  it('lerps pairwise over anchors and tangents — exactly the lottie-web morph', () => {
    const a = square(10);
    const b = square(30);
    const mid = vt.lerp(a, b, 0.5);
    expect(mid[0]!.v).toEqual([
      [-20, -20],
      [20, -20],
      [20, 20],
      [-20, 20],
    ]);
    expect(vt.lerp(a, b, 0)).toEqual(a);
    expect(vt.lerp(a, b, 1)).toEqual(b);
  });

  it('mismatched topology snaps with a one-time dev warning, never interpolates garbage', () => {
    const a = square(10);
    const tri: PathValue = [{ closed: true, v: [[0, -10], [10, 10], [-10, 10]], in: [[0, 0], [0, 0], [0, 0]], out: [[0, 0], [0, 0], [0, 0]] }];
    expect(vt.lerp(a, tri, 0.5)).toEqual(a); // hold
    expect(vt.lerp(a, tri, 1)).toEqual(tri); // snap at the end
    expect(warnings.filter((w) => w.includes('mismatched topology')).length).toBeLessThanOrEqual(1);
  });

  it('equals is deep; extrapolates is false so spring overshoot clamps', () => {
    expect(vt.equals(square(10), square(10))).toBe(true);
    expect(vt.equals(square(10), square(11))).toBe(false);
    expect(vt.extrapolates).toBe(false);
    expect(vt.defaultHandoff).toBe('blend-from-frozen');
    // a spring-eased path key samples without throwing and lands exactly
    const cfg = { kind: 'spring' as const, stiffness: 170, damping: 12, mass: 1 };
    const tr = track<PathValue>('n/d', 'path', [
      key(0, square(10)),
      key(spring.duration(cfg), square(30), cfg),
    ]) as Track<PathValue>;
    const end = sampleTrack(tr, spring.duration(cfg) + 1);
    expect(end).toEqual(square(30));
    // mid-flight the value is a valid lerp (clamped easedT keeps it in [a, b])
    const mid = sampleTrack(tr, spring.duration(cfg) * 0.5);
    expect(mid[0]!.v[1]![0]).toBeGreaterThanOrEqual(10);
    expect(mid[0]!.v[1]![0]).toBeLessThanOrEqual(30);
  });

  it('warns once per track when a non-extrapolating (path) type clamps an overshooting ease (§2.7)', () => {
    const tr = track<PathValue>('n/back', 'path', [
      key(0, square(10)),
      key(1, square(30), 'easeOutBack'), // overshoots above 1 mid-segment
    ]) as Track<PathValue>;
    for (let t = 0.1; t < 1; t += 0.1) sampleTrack(tr, t); // some samples exceed [0,1]
    const clampWarns = warnings.filter((w) => w.includes('clamped an out-of-range'));
    expect(clampWarns).toHaveLength(1); // once per track, not per sample
    expect(clampWarns[0]).toContain('n/back');
  });

  it('inferValueType sniffs PathValue so the builder authoring surface works', () => {
    expect(inferValueType(square(10))).toBe('path');
    expect(inferValueType([1, 2])).toBe('vec2'); // no clash with the vec2 sniff
    expect(() => inferValueType([])).toThrow(); // empty arrays are ambiguous — never sniffed as path
  });
});

import { describe, expect, it } from 'vitest';
import { key, timeline, track, type PathValue } from '@glissade/core';
import { createScene, evaluate, Path } from '../src/index.js';

const tri = (s: number): PathValue => [
  {
    closed: true,
    v: [
      [0, -s],
      [s, s],
      [-s, s],
    ],
    in: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    out: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  },
];

describe('Path node (Lottie S0): bezier geometry as a first-class, animatable node', () => {
  it('emits M + per-segment C + closing C/Z, and registers the d target', () => {
    const path = new Path({ id: 'p', data: tri(10), fill: '#fff', position: [50, 50] });
    const scene = createScene({ size: { w: 100, h: 100 }, children: [path] });
    expect(scene.resolveTarget('p/d')).toBeDefined();
    const list = evaluate(scene, timeline({ duration: 1 }), 0);
    const res = list.resources.find((r) => r.kind === 'path');
    expect(res).toBeDefined();
    const segs = (res as { segs: unknown[] }).segs as [string, ...number[]][];
    expect(segs.map((s) => s[0])).toEqual(['M', 'C', 'C', 'C', 'Z']); // 3 vertices closed → 3 cubics
    expect(segs[0]).toEqual(['M', 0, -10]);
  });

  it('a path track morphs the geometry through ordinary evaluation', () => {
    const path = new Path({ id: 'p', data: tri(10), fill: '#fff', position: [50, 50] });
    const scene = createScene({ size: { w: 100, h: 100 }, children: [path] });
    const doc = timeline({
      duration: 2,
      tracks: [track<PathValue>('p/d', 'path', [key(0, tri(10)), key(2, tri(30))])],
    });
    const at = (t: number) => {
      const list = evaluate(scene, doc, t);
      const res = list.resources.find((r) => r.kind === 'path') as { segs: [string, ...number[]][] };
      return res.segs[0]![2]; // the M y-coordinate = -s
    };
    expect(at(0)).toBe(-10);
    expect(at(1)).toBe(-20); // pairwise lerp midpoint
    expect(at(2)).toBe(-30);
    expect(at(1)).toBe(-20); // pure: re-sampling identical
  });

  it('coerces an SVG `d` STRING to PathValue at construction and RENDERS it (0.17.1 design-agent repro)', () => {
    // The repro: a raw SVG path string used to build fine but THROW at render
    // (the contour walk dereferenced `.v` on a string char). Now it parses.
    const path = new Path({ id: 'p', data: 'M0 0 L40 0 M28 -8 L40 0 L28 8', stroke: '#fff', position: [50, 50] });
    const scene = createScene({ size: { w: 100, h: 100 }, children: [path] });
    // No throw at evaluate; the DisplayList carries the parsed path commands.
    const list = evaluate(scene, timeline({ duration: 1 }), 0);
    const res = list.resources.find((r) => r.kind === 'path') as { segs: [string, ...number[]][] } | undefined;
    expect(res).toBeDefined();
    const ops = res!.segs.map((s) => s[0]);
    // Two subpaths (two 'M'), straight 'L' segments → emitted as 'M' + cubic 'C'.
    expect(ops.filter((o) => o === 'M').length).toBe(2);
    expect(ops).toContain('C');
    expect(res!.segs[0]).toEqual(['M', 0, 0]);
  });

  it('accepts a constant PathValue unchanged and throws a clear error on garbage data', () => {
    // A normal PathContour[] still works.
    const ok = new Path({ data: tri(5) });
    expect(ok.data()).toEqual(tri(5));
    // A number (or any non-string / non-contour-array) throws at construction.
    expect(() => new Path({ data: 42 as unknown as PathValue })).toThrow(/Path\.data expects PathValue/);
    expect(() => new Path({ data: null as unknown as PathValue })).toThrow(/got null/);
  });

  it('bounds/intrinsicSize cover control points; flowOffset is the true box top-left', () => {
    const path = new Path({
      data: [
        {
          closed: false,
          v: [
            [10, 20],
            [50, 60],
          ],
          in: [
            [0, 0],
            [-5, -45],
          ],
          out: [
            [5, 45],
            [0, 0],
          ],
        },
      ],
    });
    // control points: (10,20), out (15,65), in (45,15), (50,60)
    expect(path.bounds()).toEqual({ minX: 10, minY: 15, maxX: 50, maxY: 65 });
    expect(path.intrinsicSize()).toEqual({ w: 40, h: 50 });
    expect(path.flowOffset()).toEqual({ x: 10, y: 15 });
    expect(new Path({}).intrinsicSize()).toEqual({ w: 0, h: 0 });
  });
});

/**
 * pathFromSegs: PathSeg[] → PathValue, the inverse of Path.pathSegs. Round-trips
 * C/L/Q contours exactly so sketched/roughened geometry can ride a Path node.
 */

import { describe, expect, it } from 'vitest';
import type { PathValue } from '@glissade/core';
import { pathFromSegs, roundedRectSegs, Path } from '../src/nodes.js';
import { sketchStrokes } from '../src/sketch.js';

/** invoke the protected pathSegs via a Path node */
const segsOf = (data: PathValue) => (new Path({ id: 'p', data }) as unknown as { pathSegs(): unknown[] }).pathSegs();

describe('pathFromSegs', () => {
  it('round-trips a closed cubic contour exactly (anchors + relative tangents)', () => {
    const tri: PathValue = [
      {
        closed: true,
        v: [[0, 0], [100, 0], [50, 80]],
        in: [[-10, 5], [12, -3], [4, 9]],
        out: [[10, -5], [-12, 3], [-4, -9]],
      },
    ];
    expect(pathFromSegs(segsOf(tri) as never)).toEqual(tri);
  });

  it('an open polyline (L segments) round-trips to zero-tangent vertices', () => {
    const line: PathValue = [
      { closed: false, v: [[0, 0], [10, 0], [10, 10]], in: [[0, 0], [0, 0], [0, 0]], out: [[0, 0], [0, 0], [0, 0]] },
    ];
    expect(pathFromSegs(segsOf(line) as never)).toEqual(line);
  });

  it('promotes Q to a cubic vertex', () => {
    const pv = pathFromSegs([['M', 0, 0], ['Q', 6, 6, 12, 0]]);
    expect(pv).toHaveLength(1);
    expect(pv[0]!.v).toEqual([[0, 0], [12, 0]]);
    expect(pv[0]!.out[0]).toEqual([4, 4]); // 2/3 of (6,6)
    expect(pv[0]!.in[1]).toEqual([-4, 4]); // 2/3 of (6-12, 6-0)
  });

  it('converts roundedRectSegs and sketchStrokes output without throwing', () => {
    expect(() => pathFromSegs(roundedRectSegs(0, 0, 100, 60, 8))).not.toThrow();
    const strokes = sketchStrokes([['M', 0, 0], ['L', 50, 0], ['L', 50, 50]], { kind: 'ink' }, 1);
    expect(() => pathFromSegs(strokes[0]!)).not.toThrow();
    expect(pathFromSegs(strokes[0]!)[0]!.v.length).toBeGreaterThan(1);
  });
});

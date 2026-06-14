/**
 * Motion along a path: the arc-length sampler (constant-speed point + tangent)
 * and the followPath companion that drives a node's position/rotation.
 */

import { describe, expect, it } from 'vitest';
import type { PathValue } from '@glissade/core';
import { Rect, Path } from '../src/nodes.js';
import { motionPath, pathLength, pointAtLength, followPath } from '../src/motionPath.js';

/** a straight horizontal line [0,0] → [100,0] (zero tangents) */
const line: PathValue = [{ closed: false, v: [[0, 0], [100, 0]], in: [[0, 0], [0, 0]], out: [[0, 0], [0, 0]] }];
/** an L: [0,0] → [100,0] → [100,100], two straight segments */
const ell: PathValue = [
  { closed: false, v: [[0, 0], [100, 0], [100, 100]], in: [[0, 0], [0, 0], [0, 0]], out: [[0, 0], [0, 0], [0, 0]] },
];

describe('motionPath sampler', () => {
  it('measures arc length and samples constant-speed points', () => {
    const m = motionPath(line);
    expect(m.length).toBeCloseTo(100, 6);
    expect(m.at(0)).toEqual([0, 0]);
    expect(m.at(50)[0]).toBeCloseTo(50, 6); // arc length == x on this line
    expect(m.at(100)[0]).toBeCloseTo(100, 6);
    expect(m.atProgress(0.5)[0]).toBeCloseTo(50, 6);
  });

  it('clamps s to [0, length]', () => {
    const m = motionPath(line);
    expect(m.at(-20)).toEqual([0, 0]);
    expect(m.at(999)[0]).toBeCloseTo(100, 6);
    expect(m.atProgress(2)[0]).toBeCloseTo(100, 6);
  });

  it('gives a unit tangent in the direction of travel', () => {
    const m = motionPath(ell);
    expect(m.length).toBeCloseTo(200, 6);
    const t1 = m.tangentAt(50); // along the first (horizontal) leg
    expect(t1[0]).toBeCloseTo(1, 6);
    expect(t1[1]).toBeCloseTo(0, 6);
    const t2 = m.tangentAt(150); // along the second (vertical) leg
    expect(t2[0]).toBeCloseTo(0, 6);
    expect(t2[1]).toBeCloseTo(1, 6);
  });

  it('turns the corner: arc length continues across segments', () => {
    const m = motionPath(ell);
    expect(m.at(100)[0]).toBeCloseTo(100, 6); // the corner
    expect(m.at(100)[1]).toBeCloseTo(0, 6);
    expect(m.at(150)).toEqual([expect.closeTo(100, 6), expect.closeTo(50, 6)]);
  });

  it('pathLength / pointAtLength convenience', () => {
    expect(pathLength(ell)).toBeCloseTo(200, 6);
    expect(pointAtLength(ell, 150)[1]).toBeCloseTo(50, 6);
  });

  it('a degenerate (single-point) path does not throw', () => {
    const dot: PathValue = [{ closed: false, v: [[5, 7]], in: [[0, 0]], out: [[0, 0]] }];
    const m = motionPath(dot);
    expect(m.length).toBe(0);
    expect(m.at(0)).toEqual([5, 7]);
    expect(m.tangentAt(0)).toEqual([1, 0]);
  });
});

describe('followPath', () => {
  it('drives the target position along the path by progress', () => {
    const cursor = new Rect({ id: 'cursor', width: 8, height: 8 });
    followPath(cursor, ell, { id: 'cf', progress: 0.25 }); // s = 50 → mid first leg
    const p = cursor.position();
    expect(p[0]).toBeCloseTo(50, 6);
    expect(p[1]).toBeCloseTo(0, 6);
  });

  it('orient rotates the target to the tangent (degrees)', () => {
    const cursor = new Rect({ id: 'cursor', width: 8, height: 8 });
    const f = followPath(cursor, ell, { id: 'cf', progress: 0.75, orient: true }); // s = 150 → vertical leg
    expect(cursor.position()).toEqual([expect.closeTo(100, 6), expect.closeTo(50, 6)]);
    expect(cursor.rotation()).toBeCloseTo(90, 6); // pointing +y
    // progress is animatable: move it back onto the horizontal leg
    f.progress.set(0.25);
    expect(cursor.rotation()).toBeCloseTo(0, 6);
  });

  it('orientOffset is added to the tangent angle', () => {
    const cursor = new Rect({ id: 'cursor', width: 8, height: 8 });
    followPath(cursor, line, { id: 'cf', progress: 0.5, orient: true, orientOffset: -90 });
    expect(cursor.rotation()).toBeCloseTo(-90, 6); // tangent 0° + offset
  });

  it('accepts a Path node (snapshots its data)', () => {
    const route = new Path({ id: 'route', data: ell });
    const cursor = new Rect({ id: 'cursor', width: 8, height: 8 });
    followPath(cursor, route, { id: 'cf', progress: 1 });
    expect(cursor.position()).toEqual([expect.closeTo(100, 6), expect.closeTo(100, 6)]); // the end
  });

  it('progress clamps outside [0, 1]', () => {
    const cursor = new Rect({ id: 'cursor', width: 8, height: 8 });
    const f = followPath(cursor, line, { id: 'cf' });
    f.progress.set(5);
    expect(cursor.position()[0]).toBeCloseTo(100, 6);
    f.progress.set(-5);
    expect(cursor.position()[0]).toBeCloseTo(0, 6);
  });
});

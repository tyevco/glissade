import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { createScene, evaluate, Rect } from '../src/index.js';
import { Grid, GridError } from '../src/grid.js';

/**
 * Grid (0.20, Fork B: scene-side track resolver) is a PURE build-time fan-out —
 * like each()/splitText, NOT a Yoga feature. It resolves column tracks + gaps
 * into cell positions and moves the given children to their cell centers via the
 * ordinary `position` signal. No engine needed; it stamps no id, so it composes
 * with the goldens by construction.
 */
describe('Grid (build-time track resolver)', () => {
  const kids = (n: number) =>
    Array.from({ length: n }, (_, i) => new Rect({ id: `k${i}`, width: 10, height: 10, fill: '#fff' }));

  it('a single fixed-only row places children at cell centers, symmetric about [0,0]', () => {
    // two 20px fixed columns, gap 10 → total width 50, centers at 10 / 40 from
    // the left edge; the grid centers on the origin (left edge at -25).
    const cs = kids(2);
    Grid({ columns: [20, 20], gap: 10, children: cs });
    expect(cs[0]!.position()).toEqual([-15, 0]); // -25 + 10
    expect(cs[1]!.position()).toEqual([15, 0]); // -25 + 40
  });

  it('`columns: N` is sugar for N equal fr tracks dividing `width`', () => {
    // 3 equal fr columns over width 300, gap 0 → each 100 wide, centers 50/150/250
    // from the left edge (-150) → -100 / 0 / 100.
    const cs = kids(3);
    Grid({ columns: 3, width: 300, children: cs });
    expect(cs.map((c) => c.position()[0])).toEqual([-100, 0, 100]);
    expect(cs.every((c) => c.position()[1] === 0)).toBe(true);
  });

  it('rows fan out row-major using cellHeight as the row pitch', () => {
    // 2 columns, 4 children → 2 rows. cellHeight 20, rowGap 10 → pitch 30,
    // gridHeight = 2*20 + 1*10 = 50, top edge -25, row centers at -15 / +15.
    const cs = kids(4);
    Grid({ columns: 2, width: 100, cellHeight: 20, rowGap: 10, children: cs });
    expect(cs[0]!.position()[1]).toBe(-15);
    expect(cs[1]!.position()[1]).toBe(-15);
    expect(cs[2]!.position()[1]).toBe(15);
    expect(cs[3]!.position()[1]).toBe(15);
  });

  it('mixes fixed + fr tracks (fr shares the leftover width)', () => {
    // width 200, a 50px fixed track + a 1fr track, gap 0 → fr gets 150.
    // centers: 25 (fixed) / 50+75=125 (fr). left edge -100 → -75 / 25.
    const cs = kids(2);
    Grid({ columns: [50, { fr: 1 }], width: 200, children: cs });
    expect(cs[0]!.position()[0]).toBe(-75);
    expect(cs[1]!.position()[0]).toBe(25);
  });

  it('returns a Group (no id stamped) holding the same child instances', () => {
    const cs = kids(2);
    const g = Grid({ columns: 2, width: 100, children: cs, id: 'board' });
    expect(g.children).toEqual(cs);
    expect(g.id).toBe('board'); // the wrapping group takes id; children keep theirs
    expect(cs[0]!.id).toBe('k0'); // Grid does NOT restamp child ids
  });

  it('throws on fr tracks without an explicit width', () => {
    expect(() => Grid({ columns: 2, children: kids(2) })).toThrow(GridError);
  });

  it('throws when >1 row but no cellHeight (v1 is position-only)', () => {
    expect(() => Grid({ columns: 2, width: 100, children: kids(4) })).toThrow(GridError);
  });

  it('throws on a non-positive integer column count', () => {
    expect(() => Grid({ columns: 0, width: 100, children: kids(1) })).toThrow(GridError);
    expect(() => Grid({ columns: 2.5, width: 100, children: kids(1) })).toThrow(GridError);
  });

  it('evaluates inside a scene without a layout engine (no Yoga dependency)', () => {
    const cs = kids(2);
    const scene = createScene({ size: { w: 640, h: 360 }, children: [Grid({ columns: 2, width: 100, children: cs })] });
    expect(() => evaluate(scene, timeline({ duration: 1 }), 0)).not.toThrow();
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { createScene, evaluate, Rect } from '../src/index.js';
import { Column, Layout, Row, Stack, loadYogaLayoutEngine } from '../src/layout.js';

/**
 * Stack is a THIN factory alias over the already-shipped Yoga Layout node:
 * same memoized pure resolve, same golden stability — it only changes the
 * defaults (`direction:'column'`, `align:'start'`). These tests pin that a
 * Stack and the equivalent hand-written Layout resolve to IDENTICAL boxes.
 */
describe('Stack factory (thin alias over Layout)', () => {
  beforeAll(async () => {
    await loadYogaLayoutEngine();
  });

  /** Collect the identity-translate matrices the Layout/Stack emits. */
  function translatesOf(scene: ReturnType<typeof createScene>): [number, number][] {
    const list = evaluate(scene, timeline({ duration: 1 }), 0);
    return list.commands
      .filter((c): c is Extract<typeof c, { op: 'transform' }> => c.op === 'transform')
      .map((c) => c.m)
      .filter((m) => m[0] === 1 && m[3] === 1 && m[1] === 0 && m[2] === 0)
      .map((m) => [m[4], m[5]]);
  }

  const kids = () => [
    new Rect({ id: 'a', width: 50, height: 40, fill: '#f00' }),
    new Rect({ id: 'b', width: 60, height: 30, fill: '#0f0' }),
    new Rect({ id: 'c', width: 40, height: 20, fill: '#00f' }),
  ];

  it('a column Stack resolves IDENTICALLY to the equivalent hand-written Layout', () => {
    const stackScene = createScene({
      size: { w: 640, h: 360 },
      children: [
        Stack({
          id: 's',
          width: 200,
          height: 300,
          direction: 'column',
          gap: 16,
          padding: 12,
          justify: 'start',
          position: [320, 180],
          children: kids(),
        }),
      ],
    });
    const layoutScene = createScene({
      size: { w: 640, h: 360 },
      children: [
        new Layout({
          id: 'l',
          width: 200,
          height: 300,
          direction: 'column',
          gap: 16,
          padding: 12,
          justify: 'start',
          align: 'start', // Stack's default — written out explicitly here
          position: [320, 180],
          children: kids(),
        }),
      ],
    });
    expect(translatesOf(stackScene)).toEqual(translatesOf(layoutScene));
  });

  it('a bare Stack defaults to column + align:start (left edge); a bare Layout centers (row)', () => {
    const stackScene = createScene({
      size: { w: 640, h: 360 },
      children: [Stack({ id: 's', width: 200, height: 200, padding: 0, children: kids() })],
    });
    // align:start, column → every child's box LEFT edge sits at the container
    // left (ox=-100, padding 0 → box.x=0 for all). The emitted translate is the
    // center-anchored shape's CENTER, so recover the left edge as centerX - w/2.
    const widths = [50, 60, 40]; // kids(), in flow order
    const stackLefts = translatesOf(stackScene).map(([x], i) => x - widths[i]! / 2);
    expect(stackLefts).toEqual([-100, -100, -100]); // one shared true left edge

    // The equivalent Layout WITHOUT overriding defaults: direction 'row',
    // align 'center'. A bare Layout flows along x and centers on the cross axis,
    // so its children do NOT share the column's single left edge.
    const layoutScene = createScene({
      size: { w: 640, h: 360 },
      children: [new Layout({ id: 'l', width: 200, height: 200, padding: 0, children: kids() })],
    });
    const layoutLefts = translatesOf(layoutScene).map(([x], i) => x - widths[i]! / 2);
    expect(new Set(layoutLefts).size).toBeGreaterThan(1); // row spreads across x
    expect(layoutLefts).not.toEqual([-100, -100, -100]); // no shared left edge
  });

  it('Row({gap}) resolves IDENTICALLY to Stack({direction:row, gap}); Column likewise (0.18 pre.4)', () => {
    const sceneOf = (node: ReturnType<typeof Stack>) =>
      createScene({ size: { w: 640, h: 360 }, children: [node] });

    // Row vs Stack({direction:'row'})
    const rowScene = sceneOf(Row({ id: 'row1', gap: 12, padding: 8, position: [320, 180], children: kids() }));
    const rowStackScene = sceneOf(
      Stack({ id: 'row2', direction: 'row', gap: 12, padding: 8, position: [320, 180], children: kids() }),
    );
    expect(translatesOf(rowScene)).toEqual(translatesOf(rowStackScene));

    // Column vs Stack({direction:'column'})
    const colScene = sceneOf(Column({ id: 'col1', gap: 12, padding: 8, position: [320, 180], children: kids() }));
    const colStackScene = sceneOf(
      Stack({ id: 'col2', direction: 'column', gap: 12, padding: 8, position: [320, 180], children: kids() }),
    );
    expect(translatesOf(colScene)).toEqual(translatesOf(colStackScene));

    // Row and Column genuinely differ (proves the direction is actually applied)
    expect(translatesOf(rowScene)).not.toEqual(translatesOf(colScene));
  });

  it('Row/Column are deterministic (same inputs → same positions across calls)', () => {
    const build = () =>
      translatesOf(
        createScene({
          size: { w: 640, h: 360 },
          children: [Row({ id: 'r', gap: 6, position: [320, 180], children: kids() })],
        }),
      );
    expect(build()).toEqual(build());
  });

  it('nested Stack-in-Stack (a row of columns) resolves', () => {
    const colA = Stack({
      id: 'colA',
      width: 'auto',
      height: 'auto',
      gap: 4,
      padding: 0,
      children: [
        new Rect({ id: 'a1', width: 30, height: 20, fill: '#f00' }),
        new Rect({ id: 'a2', width: 30, height: 20, fill: '#f00' }),
      ],
    });
    const colB = Stack({
      id: 'colB',
      width: 'auto',
      height: 'auto',
      gap: 4,
      padding: 0,
      children: [
        new Rect({ id: 'b1', width: 50, height: 20, fill: '#0f0' }),
        new Rect({ id: 'b2', width: 50, height: 20, fill: '#0f0' }),
      ],
    });
    const rowOfCols = Stack({
      id: 'row',
      direction: 'row',
      width: 'auto',
      height: 'auto',
      gap: 8,
      padding: 0,
      children: [colA, colB],
    });
    createScene({ size: { w: 640, h: 360 }, children: [rowOfCols] });
    // each inner column auto-sizes from its two stacked rows: w = max child, h = 20+4+20 = 44
    expect(colA.computedSize()).toEqual({ w: 30, h: 44 });
    expect(colB.computedSize()).toEqual({ w: 50, h: 44 });
    // outer row: w = 30 + 8 + 50 = 88, h = max(44,44) = 44
    expect(rowOfCols.computedSize()).toEqual({ w: 88, h: 44 });
  });
});

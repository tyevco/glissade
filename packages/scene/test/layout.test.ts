import { beforeAll, describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { createScene, evaluate, Circle, Rect, Text, LayoutEngineMissingError } from '../src/index.js';
import { Layout, loadYogaLayoutEngine, setLayoutEngine, getLayoutEngine } from '../src/layout.js';

describe('Layout node (§3.2, Yoga behind the LayoutEngine seam)', () => {
  beforeAll(async () => {
    await loadYogaLayoutEngine();
  });

  const row = () =>
    new Layout({
      id: 'bar',
      width: 300,
      height: 100,
      direction: 'row',
      gap: 10,
      padding: 10,
      justify: 'start',
      align: 'center',
      position: [320, 180],
      children: [
        new Rect({ id: 'a', width: 50, height: 40, fill: '#f00' }),
        new Rect({ id: 'b', width: 60, height: 80, fill: '#0f0' }),
        new Circle({ id: 'c', radius: 20, fill: '#00f' }),
      ],
    });

  function transformsOf(scene: ReturnType<typeof createScene>) {
    const list = evaluate(scene, timeline({ duration: 1 }), 0);
    // collect translate transforms emitted by the Layout (identity a/d, no rotation)
    return list.commands
      .filter((c): c is Extract<typeof c, { op: 'transform' }> => c.op === 'transform')
      .map((c) => c.m)
      .filter((m) => m[0] === 1 && m[3] === 1 && m[1] === 0 && m[2] === 0);
  }

  it('places flowable children with gap and padding, vertically centered', () => {
    const scene = createScene({ size: { w: 640, h: 360 }, children: [row()] });
    const translates = transformsOf(scene);
    // container box is centered on origin: ox=-150, oy=-50; padding 10
    // a: x=10..60  → center -150+35  = -115; cy = -50+50 = 0 (align center)
    // b: x=70..130 → center -150+100 = -50
    // c: x=140..180→ center -150+160 = 10
    const centers = translates.map((m) => [m[4], m[5]]);
    expect(centers).toContainEqual([-115, 0]);
    expect(centers).toContainEqual([-50, 0]);
    expect(centers).toContainEqual([10, 0]);
  });

  it('column direction stacks downward', () => {
    const scene = createScene({
      size: { w: 640, h: 360 },
      children: [
        new Layout({
          id: 'col',
          width: 100,
          height: 200,
          direction: 'column',
          justify: 'start',
          align: 'start',
          children: [
            new Rect({ id: 'a', width: 50, height: 40, fill: '#f00' }),
            new Rect({ id: 'b', width: 50, height: 40, fill: '#0f0' }),
          ],
        }),
      ],
    });
    const centers = transformsOf(scene).map((m) => [m[4], m[5]]);
    expect(centers).toContainEqual([-25, -80]); // a: box (0,0,50,40) in 100x200 → center (25,20) - (50,100)
    expect(centers).toContainEqual([-25, -40]); // b: y=40..80 → center 60 - 100
  });

  it('justify center distributes remaining space', () => {
    const scene = createScene({
      size: { w: 640, h: 360 },
      children: [
        new Layout({
          id: 'mid',
          width: 200,
          height: 50,
          justify: 'center',
          children: [new Rect({ id: 'a', width: 40, height: 20, fill: '#fff' })],
        }),
      ],
    });
    const centers = transformsOf(scene).map((m) => [m[4], m[5]]);
    expect(centers).toContainEqual([0, 0]); // single child centered both axes
  });

  it('Text children flow with measured intrinsic size', () => {
    const scene = createScene({
      size: { w: 640, h: 360 },
      children: [
        new Layout({
          id: 'label-row',
          width: 300,
          height: 60,
          gap: 8,
          children: [
            new Rect({ id: 'swatch', width: 20, height: 20, fill: '#e6a700' }),
            new Text({ id: 'caption', text: 'hello', fontSize: 16 }),
          ],
        }),
      ],
    });
    const list = evaluate(scene, timeline({ duration: 1 }), 0);
    const text = list.commands.find((c) => c.op === 'fillText');
    expect(text).toBeDefined(); // flowed and emitted
  });

  it('layout reacts to animated container props (purity holds)', () => {
    const scene = createScene({ size: { w: 640, h: 360 }, children: [row()] });
    const doc = timeline({
      tracks: [
        { target: 'bar/gap', type: 'number', keys: [{ t: 0, value: 10 }, { t: 1, value: 40 }] },
      ],
      duration: 1,
    });
    const a0 = evaluate(scene, doc, 0);
    const a1 = evaluate(scene, doc, 1);
    expect(a1).not.toEqual(a0); // wider gap moved boxes
    expect(evaluate(scene, doc, 0)).toEqual(a0); // random access back: identical
  });

  it('throws the readiness error when no engine is registered', () => {
    const saved = getLayoutEngine()!;
    // simulate a fresh environment
    setLayoutEngine(null as unknown as Parameters<typeof setLayoutEngine>[0]);
    try {
      const scene = createScene({ size: { w: 100, h: 100 }, children: [row()] });
      expect(() => evaluate(scene, timeline({ duration: 1 }), 0)).toThrow(LayoutEngineMissingError);
    } finally {
      setLayoutEngine(saved);
    }
  });
});

describe('anchor-aware flow (Text baseline origins)', () => {
  it('left-aligned text labels in a column share a true left edge', async () => {
    await loadYogaLayoutEngine();
    const scene = createScene({
      size: { w: 640, h: 360 },
      children: [
        new Layout({
          id: 'col',
          width: 300,
          height: 200,
          direction: 'column',
          justify: 'start',
          align: 'start',
          padding: 10,
          children: [
            new Text({ id: 'short', text: 'hi', fontSize: 16 }),
            new Text({ id: 'long', text: 'a much longer label', fontSize: 16 }),
          ],
        }),
      ],
    });
    const list = evaluate(scene, timeline({ duration: 1 }), 0);
    const translates = list.commands
      .filter((c): c is Extract<typeof c, { op: 'transform' }> => c.op === 'transform')
      .filter((m) => m.m[0] === 1 && m.m[3] === 1)
      .map((c) => c.m[4]);
    // both text origins at the box left edge: -150 + 10 padding = -140
    expect(translates.filter((x) => x === -140)).toHaveLength(2);
  });
});

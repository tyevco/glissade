import { describe, expect, it } from 'vitest';
import { key, timeline, track, signal } from '@glissade/core';
import {
  applyToPoint,
  Circle,
  createScene,
  DuplicateNodeIdError,
  evaluate,
  fromTRS,
  Group,
  multiply,
  Rect,
  ReservedNodeIdError,
  Text,
  type DisplayList,
} from '../src/index.js';

const demoScene = () =>
  createScene({
    size: { w: 800, h: 450 },
    children: [
      new Circle({ id: 'circle', radius: 50, fill: '#e6a700', opacity: 0, position: [100, 225] }),
    ],
  });

const demoDoc = () =>
  timeline({
    tracks: [
      track('circle/opacity', 'number', [
        key(0, 0),
        key(1, 1, 'easeInOutCubic'),
        key(2, 1, { interp: 'hold' }),
        key(2.5, 0, 'easeOutQuad'),
      ]),
      track('circle/position.x', 'number', [key(1, 100), key(2, 400, 'easeInOutCubic')]),
    ],
  });

describe('matrices', () => {
  it('composes translate/rotate/scale like canvas transform', () => {
    const m = fromTRS([10, 20], 90, [2, 2]);
    const p = applyToPoint(m, [1, 0]);
    expect(p[0]).toBeCloseTo(10, 9);
    expect(p[1]).toBeCloseTo(22, 9);
  });

  it('multiply matches sequential application', () => {
    const a = fromTRS([5, 0], 0, [2, 1]);
    const b = fromTRS([0, 3], 0, [1, 1]);
    const ab = multiply(a, b);
    expect(applyToPoint(ab, [1, 1])).toEqual(applyToPoint(a, applyToPoint(b, [1, 1])));
  });

  it('worldMatrix chains through parents', () => {
    const inner = new Circle({ id: 'c', radius: 1, position: [1, 0] });
    const g = new Group({ position: [10, 0], scale: [2, 2], children: [inner] });
    void g;
    expect(applyToPoint(inner.worldMatrix(), [0, 0])).toEqual([12, 0]);
  });
});

describe('scene construction', () => {
  it('indexes nodes by explicit id', () => {
    const scene = demoScene();
    expect(scene.nodes.has('circle')).toBe(true);
    expect(scene.resolveTarget('circle/opacity')).toBeDefined();
    expect(scene.resolveTarget('circle/position.x')).toBeDefined();
    expect(scene.resolveTarget('ghost/opacity')).toBeUndefined();
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      createScene({
        size: { w: 100, h: 100 },
        children: [new Circle({ id: 'a' }), new Rect({ id: 'a' })],
      }),
    ).toThrow(DuplicateNodeIdError);
  });

  it("rejects an explicit id in the reserved '~' namespace at construction (§finding-4)", () => {
    expect(() =>
      createScene({ size: { w: 100, h: 100 }, children: [new Rect({ id: '~weird' })] }),
    ).toThrow(ReservedNodeIdError);
  });
});

describe('evaluate(scene, timeline, t) — the §2.5 contract', () => {
  it('produces a serializable DisplayList', () => {
    const scene = demoScene();
    const list = evaluate(scene, demoDoc(), 1.5);
    expect(list.size).toEqual({ w: 800, h: 450 });
    expect(JSON.parse(JSON.stringify(list))).toEqual(list);
    const fill = list.commands.find((c) => c.op === 'fillPath');
    expect(fill).toBeDefined();
  });

  it('same (scene, timeline, t) → identical DisplayList, any call order', () => {
    const sceneA = demoScene();
    const sceneB = demoScene();
    const doc = demoDoc();
    const ts = [2.2, 0.3, 1.5, 0.0, 2.5, 1.0];
    const a = ts.map((t) => evaluate(sceneA, doc, t));
    const sorted = [...ts].sort((x, y) => x - y);
    const b = new Map(sorted.map((t) => [t, evaluate(sceneB, doc, t)] as const));
    ts.forEach((t, i) => expect(a[i]).toEqual(b.get(t)));
  });

  it('twice ≡ once', () => {
    const scene = demoScene();
    const doc = demoDoc();
    expect(evaluate(scene, doc, 1.25)).toEqual(evaluate(scene, doc, 1.25));
  });

  it('animated values appear in the IR', () => {
    const scene = demoScene();
    const doc = demoDoc();
    const at = (t: number) => {
      const list = evaluate(scene, doc, t);
      const transform = list.commands.find((c) => c.op === 'transform');
      const group = list.commands.find((c) => c.op === 'pushGroup');
      return { transform, group };
    };
    // t=1.5: opacity holds at 1 → no pushGroup; x is mid-move
    const mid = at(1.5);
    expect(mid.group).toBeUndefined();
    expect(mid.transform && mid.transform.op === 'transform' ? mid.transform.m[4] : NaN).toBeCloseTo(
      250,
      9,
    );
    // t=0.5: fading in → pushGroup carries the eased opacity
    const fade = at(0.5);
    expect(fade.group && fade.group.op === 'pushGroup' ? fade.group.opacity : NaN).toBeCloseTo(0.5, 9);
  });

  it('opacity 0 elides the node entirely', () => {
    const scene = demoScene();
    const list = evaluate(scene, demoDoc(), 0);
    expect(list.commands.filter((c) => c.op === 'fillPath')).toHaveLength(0);
  });
});

describe('z-order (§3.1)', () => {
  it('zIndex reorders siblings stably', () => {
    const scene = createScene({
      size: { w: 10, h: 10 },
      children: [
        new Rect({ id: 'a', width: 1, height: 1, fill: '#111111', zIndex: 1 }),
        new Rect({ id: 'b', width: 1, height: 1, fill: '#222222' }),
        new Rect({ id: 'c', width: 1, height: 1, fill: '#333333', zIndex: 1 }),
      ],
    });
    const list = evaluate(scene, timeline({}), 0);
    const fills = list.commands
      .filter((c): c is Extract<typeof c, { op: 'fillPath' }> => c.op === 'fillPath')
      .map((c) => (c.paint.kind === 'color' ? c.paint.color : undefined));
    expect(fills).toEqual(['#222222', '#111111', '#333333']);
  });
});

describe('computed prop initializers (§2.1)', () => {
  it('props accept () => T sources', () => {
    const driver = signal(10);
    const c = new Circle({ id: 'c', radius: () => driver() * 2, fill: '#ffffff' });
    expect(c.radius()).toBe(20);
    driver.set(15);
    expect(c.radius()).toBe(30);
  });

  it('cross-node derivation', () => {
    const a = new Circle({ id: 'a', radius: 7 });
    const b = new Rect({ id: 'b', width: () => a.radius() * 2, height: 2, fill: '#fff' });
    expect(b.width()).toBe(14);
    a.radius.set(10);
    expect(b.width()).toBe(20);
  });
});

describe('Text node (M1 minimal)', () => {
  it('emits a fillText command', () => {
    const scene = createScene({
      size: { w: 100, h: 100 },
      children: [new Text({ id: 't', text: 'hi', fill: '#fff', fontSize: 24 })],
    });
    const list: DisplayList = evaluate(scene, timeline({}), 0);
    const cmd = list.commands.find((c) => c.op === 'fillText');
    expect(cmd && cmd.op === 'fillText' ? cmd.text : '').toBe('hi');
  });
});

describe('resource interning', () => {
  it('identical paths share one resource', () => {
    const scene = createScene({
      size: { w: 10, h: 10 },
      children: [
        new Circle({ id: 'a', radius: 5, fill: '#fff' }),
        new Circle({ id: 'b', radius: 5, fill: '#000' }),
      ],
    });
    const list = evaluate(scene, timeline({}), 0);
    expect(list.resources).toHaveLength(1);
  });
});

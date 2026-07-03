/**
 * Track → Lottie EXPORT unit tests: channel mapping, the ease-shift INVERSION
 * (glissade arriving-key ease → Lottie departing-key handles), hold, opacity
 * ×100 / scale ×100, color → 0-1 floats, and byte-for-byte determinism.
 */

import { describe, expect, it } from 'vitest';
import { key, track, type Timeline } from '@glissade/core';
import { createScene, Circle, Group, Rect, type SceneModule } from '@glissade/scene';
import { exportLottie } from '../src/index.js';
import type { LottieKeyframe, LottieLayer, LottieProp } from '../src/types.js';

/** A Rect with position (cubicBezier + hold), opacity, and fill (color) tracks. */
function rectModule(): SceneModule {
  const timeline: Timeline = {
    version: 1,
    duration: 2,
    fps: 60,
    tracks: [
      track('box/position', 'vec2', [
        key(0, [0, 0]),
        key(1, [100, 50], { kind: 'cubicBezier', pts: [0.4, 0.1, 0.6, 0.9] }),
        key(2, [100, 100], { interp: 'hold' }),
      ]),
      track('box/opacity', 'number', [key(0, 1), key(1, 0)]),
      track('box/fill', 'color', [key(0, '#ff0000'), key(2, '#0000ff')]),
    ],
  };
  return {
    createScene: () =>
      createScene({ size: { w: 200, h: 200 }, children: [new Rect({ id: 'box', width: 40, height: 40, fill: '#ff0000' })] }),
    timeline,
  };
}

const kf = (p: LottieProp): LottieKeyframe[] => p.k as LottieKeyframe[];

describe('exportLottie', () => {
  it('emits document metadata from the scene + timeline', () => {
    const doc = exportLottie(rectModule(), { width: 200, height: 200, fps: 60 });
    expect(doc.fr).toBe(60);
    expect(doc.ip).toBe(0);
    expect(doc.op).toBe(120); // duration 2s * 60fps
    expect(doc.w).toBe(200);
    expect(doc.h).toBe(200);
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0]!.ty).toBe(4); // shape layer
  });

  it('inverts the ease shift: arriving-key ease → the DEPARTING Lottie key', () => {
    const doc = exportLottie(rectModule(), { width: 200, height: 200, fps: 60 });
    const p = doc.layers[0]!.ks!.p as LottieProp;
    expect(p.a).toBe(1);
    const keys = kf(p);
    expect(keys.map((k) => k.t)).toEqual([0, 60, 120]);
    expect(keys.map((k) => k.s)).toEqual([[0, 0], [100, 50], [100, 100]]);
    // glissade key1's cubicBezier lands on Lottie key0's departing handles
    expect(keys[0]!.o).toEqual({ x: 0.4, y: 0.1 });
    expect(keys[0]!.i).toEqual({ x: 0.6, y: 0.9 });
    // glissade key2's hold → Lottie key1 h:1
    expect(keys[1]!.h).toBe(1);
    expect(keys[2]!.h).toBeUndefined();
  });

  it('scales opacity by 100', () => {
    const doc = exportLottie(rectModule(), { width: 200, height: 200, fps: 60 });
    const o = doc.layers[0]!.ks!.o as LottieProp;
    expect(o.a).toBe(1);
    expect(kf(o).map((k) => k.s)).toEqual([[100], [0]]);
  });

  it('emits solid fill as a 0-1 float color', () => {
    const doc = exportLottie(rectModule(), { width: 200, height: 200, fps: 60 });
    const shapes = doc.layers[0]!.shapes!;
    const fl = shapes.find((s) => s.ty === 'fl')!;
    const c = fl.c as LottieProp;
    expect(c.a).toBe(1);
    expect(kf(c).map((k) => k.s)).toEqual([[1, 0, 0], [0, 0, 1]]);
    // fill opacity stays 100 — node opacity lives on the layer transform
    expect(fl.o).toEqual({ a: 0, k: 100 });
  });

  it('exports a static prop as {a:0,k}', () => {
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Circle({ id: 'dot', radius: 10, fill: '#00ff00' })] }),
      timeline: { version: 1, duration: 1, fps: 60, tracks: [] },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const layer = doc.layers[0]!;
    expect((layer.ks!.p as LottieProp).a).toBe(0);
    expect((layer.ks!.o as LottieProp)).toEqual({ a: 0, k: 100 });
    const fl = layer.shapes!.find((s) => s.ty === 'fl')!;
    expect(fl.c).toEqual({ a: 0, k: [0, 1, 0] });
  });

  it('parents a group child via ind/parent (null layer for the group)', () => {
    const child = new Rect({ id: 'child', width: 10, height: 10, fill: '#ffffff' });
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Group({ id: 'g', children: [child] })] }),
      timeline: { version: 1, duration: 1, fps: 60, tracks: [] },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const g = doc.layers.find((l: LottieLayer) => l.nm === 'g')!;
    const c = doc.layers.find((l: LottieLayer) => l.nm === 'child')!;
    expect(g.ty).toBe(3); // null transform parent
    expect(c.ty).toBe(4);
    expect(c.parent).toBe(g.ind); // child references the group's ind
    expect(g.parent).toBeUndefined(); // group is a root layer
  });

  it('is deterministic: same input → byte-identical JSON', () => {
    const a = JSON.stringify(exportLottie(rectModule(), { width: 200, height: 200, fps: 60 }));
    const b = JSON.stringify(exportLottie(rectModule(), { width: 200, height: 200, fps: 60 }));
    expect(a).toBe(b);
  });
});

/**
 * MotionBlur (0.30): sampled motion blur — renders the subtree at N sub-frame times
 * across a shutter and averages them (running-mean opacity 1/(k+1)). Determinism is
 * the whole point: the samples are a pure function of the current time.
 */

import { describe, expect, it } from 'vitest';
import { key, timeline, track } from '@glissade/core';
import { Rect, createScene, evaluate, type DisplayList } from '../src/index.js';
import { MotionBlur, motionBlur } from '../src/motionBlur.js';
import { auditCacheCold } from '../src/cacheColdAudit.js';

const moverScene = (blur: { shutter?: number; samples?: number }) => () => {
  const mover = new Rect({ id: 'mover', width: 8, height: 8, fill: '#fff' });
  return createScene({
    size: { w: 200, h: 100 },
    children: [new MotionBlur({ id: 'mb', shutter: blur.shutter ?? 0.1, samples: blur.samples ?? 3, children: [mover] })],
  });
};
const tl = timeline({ fps: 60, duration: 1, tracks: [track('mover/position.x', 'number', [key(0, 0), key(1, 100)])] });

const pushOpacities = (dl: DisplayList): number[] =>
  dl.commands.flatMap((c) => (c.op === 'pushGroup' ? [c.opacity] : []));
const transformXs = (dl: DisplayList): number[] =>
  dl.commands.flatMap((c) => (c.op === 'transform' ? [c.m[4]] : []));

describe('MotionBlur', () => {
  it('samples N sub-frame times across a centered shutter, running-mean weighted', () => {
    const dl = evaluate(moverScene({ shutter: 0.1, samples: 3 })(), tl, 0.5);
    // t spans [0.45, 0.5, 0.55] → mover x = 45/50/55 (100·t, modulo float noise)
    const xs = transformXs(dl);
    const near = (v: number) => xs.some((x) => Math.abs(x - v) < 1e-6);
    expect(near(45)).toBe(true);
    expect(near(50)).toBe(true);
    expect(near(55)).toBe(true);
    // running-mean opacities: 1/1, 1/2, 1/3 (equal-weight average of the 3 samples)
    const ops = pushOpacities(dl).filter((o) => o < 1 || o === 1);
    expect(ops).toContain(1);
    expect(ops).toContain(0.5);
    expect(ops.some((o) => Math.abs(o - 1 / 3) < 1e-9)).toBe(true);
  });

  it('samples: 1 (or shutter: 0) degrades to a plain single copy', () => {
    const one = evaluate(moverScene({ samples: 1 })(), tl, 0.5);
    expect(transformXs(one).filter((x) => x === 50).length).toBe(1); // just the frame time
    const zero = evaluate(moverScene({ shutter: 0, samples: 8 })(), tl, 0.5);
    expect(transformXs(zero).filter((x) => x === 50).length).toBe(1);
  });

  it('RESTORES the playhead so a sibling after the blur samples the current time', () => {
    const mover = new Rect({ id: 'mover', width: 8, height: 8 });
    const after = new Rect({ id: 'after', width: 8, height: 8 });
    const scene = createScene({
      size: { w: 200, h: 100 },
      children: [new MotionBlur({ id: 'mb', shutter: 0.1, samples: 4, children: [mover] }), after],
    });
    const tl2 = timeline({
      fps: 60, duration: 1,
      tracks: [track('after/position.x', 'number', [key(0, 0), key(1, 100)])],
    });
    evaluate(scene, tl2, 0.5);
    expect(after.position()[0]).toBe(50); // sibling at the current time, not an offset
    expect(scene.playhead.peek()).toBe(0.5);
  });

  it('is a pure function of time — cold re-eval is byte-identical', () => {
    expect(auditCacheCold(moverScene({ shutter: 0.08, samples: 6 }), tl, 0.42)).toEqual({ ok: true });
  });

  it('scrubs backward without cross-frame state', () => {
    const scene = moverScene({ shutter: 0.1, samples: 4 })();
    const a = evaluate(scene, tl, 0.7);
    const a2 = evaluate(scene, tl, 0.7);
    const b = evaluate(scene, tl, 0.3);
    expect(a2).toEqual(a);
    expect(b).not.toEqual(a);
  });

  it('motionBlur() helper wraps a single child', () => {
    const r = new Rect({ id: 'r', width: 5, height: 5 });
    const mb = motionBlur(r, { shutter: 0.05, samples: 10 });
    expect(mb).toBeInstanceOf(MotionBlur);
    expect(mb.children).toEqual([r]);
    expect(mb.samples).toBe(10);
  });
});

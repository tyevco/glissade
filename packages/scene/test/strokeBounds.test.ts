/**
 * The ONE shared join→extent rule (strokeBounds.ts) — the belt that keeps
 * critique's stroke AABB and the camera's clear/worldBoxOf from drifting. Pins the
 * rule (round/bevel/capped → width/2; miter sharp → miterLimit×width/2), the
 * honest-join DL emit (a rounded rect emits join:'round'; a sharp rect keeps
 * miter), and — the load-bearing invariant — that the value fed to BOTH consumers
 * (strokeExtent from the node's stroke {width, strokeJoin()} for the camera,
 * strokeExtent(cmd.stroke) for critique) is the SAME number by construction.
 */

import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { createScene, Rect, evaluate, type DisplayList } from '../src/index.js';
import { strokeExtent, DEFAULT_MITER_LIMIT } from '../src/strokeBounds.js';

const emptyTl = timeline({ fps: 60, duration: 1, tracks: [] });

describe('strokeExtent — the shared join→extent rule', () => {
  it('miter (default / explicit) on sharp corners → miterLimit × width/2 = 5×width', () => {
    expect(strokeExtent({ width: 24 })).toBe(120); // default miter, 10 × 12 = 5 × 24
    expect(strokeExtent({ width: 24, join: 'miter' })).toBe(120);
    expect(DEFAULT_MITER_LIMIT).toBe(10);
  });

  it('round / bevel joins → width/2 (a smooth outline never spikes)', () => {
    expect(strokeExtent({ width: 24, join: 'round' })).toBe(12);
    expect(strokeExtent({ width: 24, join: 'bevel' })).toBe(12);
  });

  it('any cap present → width/2 (an end-capped line, not a miter spike)', () => {
    expect(strokeExtent({ width: 24, cap: 'round' })).toBe(12);
    expect(strokeExtent({ width: 24, cap: 'square' })).toBe(12);
  });

  it('honours an explicit miterLimit', () => {
    expect(strokeExtent({ width: 24, miterLimit: 4 })).toBe(48); // 4 × 12
  });

  it('non-positive width → 0 (no stroke, no extent)', () => {
    expect(strokeExtent({ width: 0 })).toBe(0);
    expect(strokeExtent({ width: -5 })).toBe(0);
  });
});

/** The camera-side extent: the shared rule applied to the node's stroke {width, join}
 *  (the SAME structural read camera's worldBoxOf performs). */
const nodeExtent = (r: Rect): number => {
  const width = r.strokeWidth();
  if (!r.stroke() || !(width > 0)) return 0;
  const join = r.strokeJoin();
  return strokeExtent(join !== undefined ? { width, join } : { width });
};

describe('strokeJoin → strokeExtent — the camera-side consumer', () => {
  it('a rounded stroked Rect → join:"round" → width/2 (not the miter spike, not 0)', () => {
    const r = new Rect({ id: 'r', width: 100, height: 60, cornerRadius: 12, stroke: '#000', strokeWidth: 24 });
    expect(r.strokeJoin()).toBe('round');
    expect(nodeExtent(r)).toBe(12);
  });

  it('a SHARP stroked Rect → no join (miter default) → miter extent (5×width)', () => {
    const r = new Rect({ id: 'r', width: 100, height: 60, cornerRadius: 0, stroke: '#000', strokeWidth: 24 });
    expect(r.strokeJoin()).toBeUndefined();
    expect(nodeExtent(r)).toBe(120); // 10 × 12 = 5 × 24
  });

  it('an UNSTROKED node → extent 0 (byte-neutral: content box only)', () => {
    expect(nodeExtent(new Rect({ id: 'r', width: 100, height: 60, cornerRadius: 12, fill: '#fff' }))).toBe(0);
    expect(nodeExtent(new Rect({ id: 'r', width: 100, height: 60, stroke: '#000', strokeWidth: 0 }))).toBe(0);
  });
});

/** Find the single strokePath command + resolve its stroke style from a DL. */
const strokeStyleOf = (dl: DisplayList) => {
  const cmd = dl.commands.find((c) => c.op === 'strokePath');
  if (cmd === undefined || cmd.op !== 'strokePath') throw new Error('no strokePath emitted');
  return cmd.stroke;
};

describe('honest join emit + can’t-disagree-by-construction', () => {
  it('a rounded stroked Rect emits join:"round" in the DL', () => {
    const r = new Rect({ id: 'r', width: 100, height: 60, cornerRadius: 12, stroke: '#000', strokeWidth: 8, position: [100, 100] });
    const scene = createScene({ size: { w: 200, h: 200 }, children: [r] });
    const stroke = strokeStyleOf(evaluate(scene, emptyTl, 0));
    expect(stroke.join).toBe('round');
  });

  it('a SHARP stroked Rect emits NO join (miter default) — byte-identical DL', () => {
    const r = new Rect({ id: 'r', width: 100, height: 60, cornerRadius: 0, stroke: '#000', strokeWidth: 8, position: [100, 100] });
    const scene = createScene({ size: { w: 200, h: 200 }, children: [r] });
    const stroke = strokeStyleOf(evaluate(scene, emptyTl, 0));
    expect(stroke.join).toBeUndefined();
  });

  it('the camera-side extent EQUALS the critique-side extent (strokeExtent of the DL command) — the two consumers cannot drift', () => {
    for (const cornerRadius of [0, 12]) {
      const r = new Rect({ id: 'r', width: 100, height: 60, cornerRadius, stroke: '#000', strokeWidth: 24, position: [100, 100] });
      const scene = createScene({ size: { w: 200, h: 200 }, children: [r] });
      const dlExtent = strokeExtent(strokeStyleOf(evaluate(scene, emptyTl, 0))); // what critique computes
      expect(nodeExtent(r)).toBe(dlExtent); // what the camera computes (same shared rule, same {width,join})
    }
  });
});

/**
 * Echo (0.26): motion-trail / onion-skin wrapper. Renders its subtree at the
 * playhead plus K−1 earlier offsets with decaying opacity, by re-addressing the
 * scene playhead within one frame and restoring it. Determinism is the whole
 * point: the ghosts are a pure function of the current time.
 */

import { describe, expect, it } from 'vitest';
import { key, timeline, track } from '@glissade/core';
import { Circle, Rect, createScene, evaluate, type DisplayList } from '../src/index.js';
import { Echo, echo } from '../src/echo.js';
import { auditCacheCold } from '../src/cacheColdAudit.js';

// a mover whose x sweeps 0→100 over t∈[0,1]
const moverScene = (echoProps: { count?: number; spacing?: number; decay?: number }) => () => {
  const mover = new Rect({ id: 'mover', width: 8, height: 8, fill: '#fff' });
  return createScene({
    size: { w: 200, h: 100 },
    children: [new Echo({ id: 'e', count: echoProps.count ?? 3, spacing: echoProps.spacing ?? 0.1, decay: echoProps.decay ?? 0.5, children: [mover] })],
  });
};
const tl = timeline({ fps: 60, duration: 1, tracks: [track('mover/position.x', 'number', [key(0, 0), key(1, 100)])] });

const pushOpacities = (dl: DisplayList): number[] =>
  dl.commands.flatMap((c) => (c.op === 'pushGroup' ? [c.opacity] : []));
const transformXs = (dl: DisplayList): number[] =>
  dl.commands.flatMap((c) => (c.op === 'transform' ? [c.m[4]] : []));

describe('Echo — trails', () => {
  it('emits `count` copies with decay^i opacity, live copy on top (last)', () => {
    const scene = moverScene({ count: 3, spacing: 0.1, decay: 0.5 })();
    const dl = evaluate(scene, tl, 0.5);
    // Echo's own group (opacity 1) + 3 ghost groups (0.25, 0.5, 1 — oldest first)
    const ops = pushOpacities(dl);
    expect(ops).toContain(1); // live + Echo wrapper
    expect(ops).toContain(0.5); // i=1
    expect(ops).toContain(0.25); // i=2 (0.5^2)
    // the three ghost groups appear oldest→newest so the live copy paints last
    const ghostOps = ops.filter((o) => o < 1);
    expect(ghostOps).toEqual([0.25, 0.5]); // 0.25 before 0.5 (older first); the 1.0 live copy is a separate entry
  });

  it('ghosts show PAST positions (t − i·spacing)', () => {
    const scene = moverScene({ count: 3, spacing: 0.1, decay: 0.5 })();
    const dl = evaluate(scene, tl, 0.5);
    const xs = transformXs(dl);
    // mover x = 100·t: i=2→t0.3→30, i=1→t0.4→40, i=0→t0.5→50 (oldest first)
    expect(xs).toContain(30);
    expect(xs).toContain(40);
    expect(xs).toContain(50);
    expect(xs.indexOf(30)).toBeLessThan(xs.indexOf(50)); // oldest emitted first
  });

  it('RESTORES the playhead so a sibling after the Echo samples the current time', () => {
    const mover = new Rect({ id: 'mover', width: 8, height: 8 });
    const after = new Rect({ id: 'after', width: 8, height: 8 });
    const scene = createScene({
      size: { w: 200, h: 100 },
      children: [new Echo({ id: 'e', count: 4, spacing: 0.1, children: [mover] }), after],
    });
    const tl2 = timeline({
      fps: 60,
      duration: 1,
      tracks: [
        track('mover/position.x', 'number', [key(0, 0), key(1, 100)]),
        track('after/position.x', 'number', [key(0, 0), key(1, 100)]),
      ],
    });
    evaluate(scene, tl2, 0.5);
    // the sibling AFTER the echo must be at t=0.5 (50), not stuck at an offset time
    expect(after.position()[0]).toBe(50);
    // and the scene playhead is back at 0.5
    expect(scene.playhead.peek()).toBe(0.5);
  });

  it('count=1 (or spacing=0) degrades to a plain single copy', () => {
    const scene = moverScene({ count: 1 })();
    const dl = evaluate(scene, tl, 0.5);
    expect(transformXs(dl).filter((x) => x === 50).length).toBe(1);
  });

  it('is a pure function of time — cold re-eval is byte-identical', () => {
    const factory = moverScene({ count: 5, spacing: 0.05, decay: 0.7 });
    expect(auditCacheCold(factory, tl, 0.42)).toEqual({ ok: true });
  });

  it('scrubs backward without cross-frame state', () => {
    const scene = moverScene({ count: 3, spacing: 0.1, decay: 0.5 })();
    const a = evaluate(scene, tl, 0.7);
    const b = evaluate(scene, tl, 0.3);
    const a2 = evaluate(scene, tl, 0.7);
    expect(a2).toEqual(a);
    expect(b).not.toEqual(a); // different frame → different ghosts
  });

  it('echo() helper wraps a single child', () => {
    const c = new Circle({ id: 'c', radius: 5 });
    const e = echo(c, { count: 4 });
    expect(e).toBeInstanceOf(Echo);
    expect(e.children).toEqual([c]);
    expect(e.count).toBe(4);
  });
});

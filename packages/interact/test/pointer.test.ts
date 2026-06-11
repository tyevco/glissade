import { beforeEach, describe, expect, it } from 'vitest';
import { type Scene } from '@glissade/scene';
import { pointerDriver, splitVec2, springFilter } from '../src/index.js';

// ---- rAF stub: manual frame pump --------------------------------------------
let rafQueue: Array<() => void> = [];
(globalThis as Record<string, unknown>)['requestAnimationFrame'] = (cb: () => void) => {
  rafQueue.push(cb);
  return rafQueue.length;
};
(globalThis as Record<string, unknown>)['cancelAnimationFrame'] = () => {};
const pumpFrame = () => {
  const q = rafQueue;
  rafQueue = [];
  for (const cb of q) cb();
};

class FakeEl {
  handlers = new Map<string, (ev: unknown) => void>();
  addEventListener(t: string, fn: (ev: unknown) => void): void {
    this.handlers.set(t, fn);
  }
  removeEventListener(t: string): void {
    this.handlers.delete(t);
  }
  getBoundingClientRect() {
    return { left: 10, top: 20, width: 400, height: 200 };
  }
  move(clientX: number, clientY: number): void {
    this.handlers.get('pointermove')?.({ clientX, clientY });
  }
}

beforeEach(() => {
  rafQueue = [];
});

describe('splitVec2 (§A.2): vec2 fans out to two number inputs', () => {
  it('routes components in order', () => {
    const xs: number[] = [];
    const ys: number[] = [];
    const write = splitVec2(
      (v) => xs.push(v),
      (v) => ys.push(v),
    );
    write([3, 4]);
    write([5, 6]);
    expect(xs).toEqual([3, 5]);
    expect(ys).toEqual([4, 6]);
  });
});

describe('pointerDriver (§C.1): rAF-coalesced, scene-scaled', () => {
  const scene = { size: { w: 800, h: 400 } } as Scene;
  const ctx = { visibility: () => 'visible' as const };

  it('coalesces intermediate moves: one write per frame, last position wins', () => {
    const el = new FakeEl();
    const writes: Array<readonly [number, number]> = [];
    const driver = pointerDriver({ target: el as unknown as Element, scene });
    driver.start((v) => writes.push(v), ctx);
    el.move(110, 120); // local (100, 100) → scene (200, 200) at 2× scale
    el.move(210, 120);
    el.move(310, 120);
    expect(writes).toEqual([]); // nothing lands until the frame
    pumpFrame();
    expect(writes).toEqual([[600, 200]]); // only the last move
    el.move(110, 20);
    pumpFrame();
    expect(writes).toEqual([
      [600, 200],
      [200, 0],
    ]);
    driver.stop();
    el.move(110, 120);
    pumpFrame();
    expect(writes.length).toBe(2); // stopped: no further writes
  });

  it('defaults to element-local CSS px without a scene', () => {
    const el = new FakeEl();
    const writes: Array<readonly [number, number]> = [];
    const driver = pointerDriver({ target: el as unknown as Element });
    driver.start((v) => writes.push(v), ctx);
    el.move(110, 120);
    pumpFrame();
    expect(writes).toEqual([[100, 100]]);
    driver.stop();
  });
});

describe('springFilter (§C.2): closed-form spring segments in the driver closure', () => {
  const cfg = { stiffness: 170, damping: 26, mass: 1 };

  it('the first write snaps — no fly-in from zero', () => {
    const f = springFilter(cfg);
    f.retarget(5, 100);
    expect(f.sample(5)).toBe(100);
    expect(f.velocity(5)).toBe(0);
    expect(f.settled(5)).toBe(true);
  });

  it('retargets are velocity-matched: C0 and C1 continuous at every switch', () => {
    const f = springFilter(cfg);
    f.retarget(0, 100);
    f.retarget(1, 200); // start moving
    expect(f.sample(1)).toBeCloseTo(100, 9); // C0 at the retarget
    expect(f.velocity(1)).toBe(0);
    const tMid = 1.06;
    const x = f.sample(tMid);
    const v = f.velocity(tMid);
    expect(x).toBeGreaterThan(100);
    expect(v).toBeGreaterThan(0);
    f.retarget(tMid, 50); // reverse mid-flight
    expect(f.sample(tMid)).toBeCloseTo(x, 9); // C0 exact
    expect(f.velocity(tMid)).toBeCloseTo(v, 9); // C1 exact — momentum carries through the reversal
    expect(f.sample(tMid + 10)).toBeCloseTo(50, 3); // settles on the new target
    expect(f.settled(tMid + 10)).toBe(true);
  });

  it('sampling at arbitrary t is exact: no fixed-Δt stepping (same result, any call order)', () => {
    const mk = () => {
      const f = springFilter(cfg);
      f.retarget(0, 0);
      f.retarget(0.5, 80);
      f.retarget(0.7, -20);
      return f;
    };
    const a = mk();
    const b = mk();
    const dense = [0.71, 0.75, 0.8, 0.9, 1.2, 2].map((t) => a.sample(t));
    const sparse = [2, 0.71].map((t) => b.sample(t)); // reverse order, fewer reads
    expect(sparse[0]).toBe(dense[5]);
    expect(sparse[1]).toBe(dense[0]);
  });
});

/**
 * Controlled / imperative drive (0.19) — the BLESSED contract for a host that
 * owns the clock: `node.position.x.set(...)` between frames + `evaluate(scene)`
 * (no timeline), per rAF. The mechanism already works (an empty/absent timeline
 * installs ZERO computed sources, so imperative sets survive evaluate); these
 * pin it so it can't silently break. See docs/controlled-drive.md.
 *
 * The transform command carries the local matrix as [a,b,c,d,e,f]; m[4]/m[5]
 * are the translation (= position.x / position.y), so the DisplayList reflects
 * exactly the value that won the prop.
 */

import { describe, expect, it } from 'vitest';
import { key, timeline, track } from '@glissade/core';
import { Rect, createScene, evaluate } from '../src/index.js';

/** Pull position.x out of the (single) emitted transform command. */
function emittedX(list: ReturnType<typeof evaluate>): number {
  const xf = list.commands.find((c) => c.op === 'transform') as { m: readonly number[] } | undefined;
  if (!xf) throw new Error('no transform command emitted');
  return xf.m[4]!;
}

describe('controlled drive: evaluate(scene) (no timeline) honors imperative .set()', () => {
  it('(a) node.set then evaluate(scene) → the set survives into the DisplayList', () => {
    const r = new Rect({ id: 'box', width: 10, height: 10 });
    const scene = createScene({ size: { w: 100, h: 100 }, children: [r] });

    r.position.x.set(5);
    expect(emittedX(evaluate(scene))).toBe(5);
  });

  it('(b) a timeline that animates x OVERRIDES the set at the played t (precedence contract)', () => {
    const r = new Rect({ id: 'box', width: 10, height: 10 });
    const scene = createScene({ size: { w: 100, h: 100 }, children: [r] });

    r.position.x.set(5); // host tries to own x...
    const doc = timeline({ tracks: [track('box/position.x', 'number', [key(0, 100), key(1, 200)])] });

    // ...but the live track is last-writer for the prop it targets.
    expect(emittedX(evaluate(scene, doc, 0))).toBe(100);
    expect(emittedX(evaluate(scene, doc, 1))).toBe(200);
    expect(emittedX(evaluate(scene, doc, 0.5))).toBe(150);
  });

  it('(c) .set() between two evaluate(scene) calls is honored each time (host owns the clock loop)', () => {
    const r = new Rect({ id: 'box', width: 10, height: 10 });
    const scene = createScene({ size: { w: 100, h: 100 }, children: [r] });

    // the per-frame host loop: set, evaluate, render — repeat with a new value.
    r.position.x.set(10);
    expect(emittedX(evaluate(scene))).toBe(10);

    r.position.x.set(42);
    expect(emittedX(evaluate(scene))).toBe(42);

    r.position.x.set(-7);
    expect(emittedX(evaluate(scene))).toBe(-7);
  });

  it('evaluate(scene) reads the current playhead (peek), not a hardcoded 0', () => {
    const r = new Rect({ id: 'box', width: 10, height: 10 });
    const scene = createScene({ size: { w: 100, h: 100 }, children: [r] });

    // empty timeline ⇒ no track samples the playhead, so x is whatever was set;
    // the playhead value still flows into EvalContext.time. Drive it and confirm
    // evaluate(scene) does not throw and respects the imperative value.
    scene.playhead.set(0.75);
    r.position.x.set(3);
    const list = evaluate(scene);
    expect(emittedX(list)).toBe(3);
  });

  it('once a clobbering track is removed (empty timeline again), .set() is honored once more', () => {
    const r = new Rect({ id: 'box', width: 10, height: 10 });
    const scene = createScene({ size: { w: 100, h: 100 }, children: [r] });

    const doc = timeline({ tracks: [track('box/position.x', 'number', [key(0, 100)])] });
    r.position.x.set(5);
    expect(emittedX(evaluate(scene, doc, 0))).toBe(100); // track wins while live

    // back to controlled drive: no timeline ⇒ the imperative value rules again.
    r.position.x.set(9);
    expect(emittedX(evaluate(scene))).toBe(9);
  });
});

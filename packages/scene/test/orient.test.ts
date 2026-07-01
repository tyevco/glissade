/**
 * Orientation drivers (0.26): orientToPath (rotation-only path-tangent banking)
 * and lookAt (face another node). Both own only the target's `rotation` and are
 * pure functions of the signal graph, so evaluate() stays deterministic.
 */

import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import type { PathValue } from '@glissade/core';
import { Circle, Group, Rect, createScene, evaluate } from '../src/index.js';
import { orientToPath, lookAt } from '../src/orient.js';

/** an L: [0,0] → [100,0] → [100,100] — horizontal then vertical leg */
const ell: PathValue = [
  { closed: false, v: [[0, 0], [100, 0], [100, 100]], in: [[0, 0], [0, 0], [0, 0]], out: [[0, 0], [0, 0], [0, 0]] },
];

describe('orientToPath', () => {
  it('banks the target to the path tangent at progress (degrees), position untouched', () => {
    const sprite = new Rect({ id: 'sprite', width: 8, height: 8, position: [42, 17] });
    const o = orientToPath(sprite, ell, { id: 'o', progress: 0.25 }); // first (horizontal) leg → 0°
    expect(sprite.rotation()).toBeCloseTo(0, 6);
    expect(sprite.position()).toEqual([42, 17]); // position is NOT owned by orientToPath
    o.progress.set(0.75); // second (vertical) leg → 90°
    expect(sprite.rotation()).toBeCloseTo(90, 6);
  });

  it('adds the offset (e.g. a sprite that points up at rest)', () => {
    const sprite = new Rect({ id: 's', width: 8, height: 8 });
    orientToPath(sprite, ell, { progress: 0.25, offset: -90 });
    expect(sprite.rotation()).toBeCloseTo(-90, 6);
  });

  it('exposes progress as an animatable target and re-derives purely on scrub', () => {
    const sprite = new Rect({ id: 'sprite', width: 8, height: 8 });
    // the driver node must be in the scene so the track resolves '<id>/progress'
    const o = orientToPath(sprite, ell, { id: 'o', progress: 0 });
    const scene = createScene({ size: { w: 320, h: 240 }, children: [sprite, o] });
    const tl = timeline((b) => b.fromTo('o/progress', 0, 1, { duration: 1 }));
    evaluate(scene, tl, 0.9); // progress 0.9 → arc 180 → vertical leg → 90°
    expect(sprite.rotation()).toBeCloseTo(90, 6);
    evaluate(scene, tl, 0.1); // scrub back → arc 20 → horizontal leg, no cross-frame state
    expect(sprite.rotation()).toBeCloseTo(0, 6);
  });
});

describe('lookAt', () => {
  it('aims the target +x axis at the other node (world origin)', () => {
    const turret = new Rect({ id: 'turret', width: 10, height: 10, position: [0, 0] });
    const mover = new Circle({ id: 'mover', radius: 4, position: [10, 10] });
    lookAt(turret, mover);
    expect(turret.rotation()).toBeCloseTo(45, 6); // atan2(10,10)
    mover.position.set([0, -20]); // straight up (canvas +y is down → -y is up)
    expect(turret.rotation()).toBeCloseTo(-90, 6);
    mover.position.set([-5, 0]); // to the left
    expect(turret.rotation()).toBeCloseTo(180, 6);
  });

  it('does NOT deadlock reading its own rotation (no rotation→worldMatrix cycle)', () => {
    const turret = new Rect({ id: 'turret', width: 10, height: 10, position: [3, 4] });
    const mover = new Rect({ id: 'mover', width: 4, height: 4, position: [3, 4] });
    lookAt(turret, mover);
    // same origin → atan2(0,0) === 0, and crucially this returns without recursing
    expect(turret.rotation()).toBeCloseTo(0, 6);
  });

  it('respects a parent transform on the aimed-at node (world origin via parent matrix)', () => {
    const turret = new Rect({ id: 'turret', width: 10, height: 10, position: [0, 0] });
    const mover = new Circle({ id: 'mover', radius: 4, position: [10, 0] });
    // parent translated by (0,10): mover world origin = (10,10) → 45°
    const grp = new Group({ id: 'g', position: [0, 10], children: [mover] });
    lookAt(turret, mover);
    const scene = createScene({ size: { w: 320, h: 240 }, children: [turret, grp] });
    evaluate(scene, timeline({ duration: 1 }), 0);
    expect(turret.rotation()).toBeCloseTo(45, 6);
  });

  it('applies the offset', () => {
    const turret = new Rect({ id: 'turret', width: 10, height: 10, position: [0, 0] });
    const mover = new Rect({ id: 'mover', width: 4, height: 4, position: [10, 0] }); // 0°
    lookAt(turret, mover, { offset: -90 });
    expect(turret.rotation()).toBeCloseTo(-90, 6);
  });
});

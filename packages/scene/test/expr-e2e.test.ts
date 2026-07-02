/**
 * Expr (0.40) end-to-end: a formula-driven Track binds to a real node prop through
 * the SAME channel keyframes use (binding.ts → sampleTrack at the playhead), so the
 * prop follows `f(t)` and the DisplayList is a pure, byte-identical function of time.
 */

import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { exprTrack } from '@glissade/core/expr'; // the evaluator entry (registers the seam)
import { Circle, createScene, evaluate } from '../src/index.js';

function scene() {
  return createScene({
    size: { w: 200, h: 200 },
    children: [new Circle({ id: 'orb', radius: 10, position: [100, 100], fill: '#4ea1ff' })],
  });
}

describe('Expr end-to-end (a node prop driven by a formula of t)', () => {
  it('binds an expr track to a prop; the prop follows f(t) at the playhead', () => {
    const sc = scene();
    const tl = timeline((tl) => tl.tracks([exprTrack('orb/position.y', '100 + 80*sin(t*2)')]));
    evaluate(sc, tl, 0);
    const orb = sc.nodes.get('orb') as Circle;
    expect(orb.position().at(1)).toBeCloseTo(100, 6); // sin(0)=0 → y=100
    evaluate(sc, tl, Math.PI / 4);
    expect(orb.position().at(1)).toBeCloseTo(180, 6); // sin(PI/2)=1 → y=180
    evaluate(sc, tl, (3 * Math.PI) / 4);
    expect(orb.position().at(1)).toBeCloseTo(20, 6); // sin(3PI/2)=-1 → y=20
  });

  it('drives a scalar prop (opacity) too', () => {
    const sc = scene();
    const tl = timeline((tl) => tl.tracks([exprTrack('orb/opacity', '0.5 + 0.5*cos(t)')]));
    evaluate(sc, tl, 0);
    expect((sc.nodes.get('orb') as Circle).opacity()).toBeCloseTo(1, 6); // cos(0)=1
    evaluate(sc, tl, Math.PI);
    expect((sc.nodes.get('orb') as Circle).opacity()).toBeCloseTo(0, 6); // cos(PI)=-1
  });

  it('is a pure function of time: same scene + t → byte-identical DisplayList', () => {
    const tl = timeline((tl) => tl.tracks([exprTrack('orb/position.y', '100 + 40*sin(t*3) + 10*rand(floor(t*4))')]));
    const a = JSON.stringify(evaluate(scene(), tl, 0.42));
    const b = JSON.stringify(evaluate(scene(), tl, 0.42));
    expect(a).toBe(b);
    // and different t genuinely differs (the formula is live)
    expect(JSON.stringify(evaluate(scene(), tl, 0.9))).not.toBe(a);
  });
});

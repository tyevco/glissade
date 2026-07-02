/**
 * Golden corpus (0.40): the Expr authoring stack. Every animated prop here is a
 * FORMULA of the playhead `t` via `tl.expr(target, formula)` — no keyframes. Three
 * orbs ride Lissajous paths (`cx + A*sin(t*a)`, `cy + B*cos(t*b)`) with radii
 * pulsing on `sin`, colour-independent, plus a scalar `opacity` breathing on
 * `cos`. Expr binds through the SAME playhead channel as keyframes, so this is a
 * pure function of time — byte-compared on Skia in CI.
 */

import { timeline } from '@glissade/core';
import { exprTrack } from '@glissade/core/expr'; // the evaluator entry (off the base embed)
import { Circle, Rect, createScene, type SceneModule } from '@glissade/scene';

const orbs = [
  { id: 'a', color: '#4ea1ff', ax: 3, ay: 2, phase: 0 },
  { id: 'b', color: '#3ddc97', ax: 2, ay: 3, phase: 1 },
  { id: 'c', color: '#ff5d73', ax: 4, ay: 3, phase: 2 },
];

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0a0e17' }),
        ...orbs.map((o) => new Circle({ id: o.id, radius: 24, position: [320, 180], fill: o.color })),
      ],
    }),
  timeline: timeline({
    fps: 60,
    duration: 3,
    // every track is a formula of t — a Lissajous orbit + a pulsing radius per orb.
    tracks: orbs.flatMap((o) => [
      exprTrack(`${o.id}/position.x`, `320 + 220*sin(t*${o.ax} + ${o.phase})`),
      exprTrack(`${o.id}/position.y`, `180 + 120*cos(t*${o.ay} + ${o.phase})`),
      exprTrack(`${o.id}/radius`, `24 + 14*sin(t*3 + ${o.phase})`),
      exprTrack(`${o.id}/opacity`, `0.65 + 0.35*cos(t*2 + ${o.phase})`),
    ]),
  }),
};

export default mod;

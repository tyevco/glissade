/**
 * Golden corpus #2: baked physics (DESIGN.md §2.8 / M3 exit criterion).
 * A bouncing ball with restitution — velocity accumulates across frames, the
 * one thing pure f(t) cannot express — baked into ordinary tracks, then
 * composed with hand-authored tweens via the builder.
 */

import { bake, timeline, type Rng, type Vec2 } from '@glissade/core';
import { Circle, Rect, createScene, type SceneModule } from '@glissade/scene';

interface World {
  pos: Vec2;
  vel: Vec2;
  squash: number;
}

const baked = bake({
  duration: 3,
  fps: 60,
  seed: 7,
  setup: (rng: Rng): World => ({ pos: [80, 60], vel: [150 + rng() * 30, 0], squash: 1 }),
  step: (w: World, dt: number): World => {
    const vy = w.vel[1] + 1400 * dt;
    let y = w.pos[1] + vy * dt;
    let outVy = vy;
    let squash = Math.min(1, w.squash + dt * 6);
    if (y > 300) {
      y = 300;
      outVy = -vy * 0.75;
      squash = 0.65;
    }
    return { pos: [w.pos[0] + w.vel[0] * dt, y], vel: [w.vel[0], outVy], squash };
  },
  sample: (w: World) => ({
    'ball/position': w.pos,
    'ball/scale': [2 - w.squash, w.squash] as Vec2,
  }),
});

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Rect({ id: 'floor', width: 640, height: 24, position: [320, 336], fill: '#2a2f3a' }),
        new Circle({ id: 'ball', radius: 24, fill: '#4ea1ff', position: [80, 60] }),
      ],
    }),
  timeline: timeline(
    (tl) => {
      tl.add(timeline({ tracks: baked }), 0)
        // string targets have no builder-visible base — anchor the sweep with { from }
        // (matching the ctor fill) or the track sits at its END state for the whole
        // timeline (the ball rendered red from frame 0 until this fix)
        .to('ball/fill', '#ff5d73', { from: '#4ea1ff', duration: 3, at: 0, ease: 'easeInOutSine' })
        .fromTo('floor/opacity', 0, 1, { duration: 0.5, at: 0, ease: 'easeOutQuad' });
    },
    { fps: 60, duration: 3 },
  ),
};

export default mod;

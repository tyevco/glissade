/**
 * Golden corpus scene (DESIGN.md §7.3 tier 2): shapes only — text waits on
 * explicit font registration (§3.6), since system-font fallback would break
 * byte-exactness between machines. Exercises transforms, easing, springs,
 * group opacity, blend, color tracks, and z-order.
 */

import { key, spring, timeline, track, type Vec2 } from '@glissade/core';
import { Circle, Group, Rect, createScene, type SceneModule } from '@glissade/scene';

const springCfg = { stiffness: 170, damping: 14, mass: 1 };
const springDur = spring.duration(springCfg);

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Group({
          id: 'cluster',
          position: [200, 180],
          children: [
            new Circle({ id: 'orb', radius: 48, fill: '#e6a700' }),
            new Rect({
              id: 'panel',
              width: 90,
              height: 90,
              position: [60, -40],
              fill: '#4ea1ff',
              blend: 'screen',
              zIndex: -1,
            }),
          ],
        }),
        new Circle({ id: 'pulse', radius: 30, fill: '#ff5d73', position: [480, 260], opacity: 0.8 }),
      ],
    }),
  timeline: timeline({
    duration: 3,
    fps: 60,
    tracks: [
      track('cluster/position.x', 'number', [key(0, 200), key(springDur, 420, spring(springCfg))]),
      track('cluster/rotation', 'number', [key(0.5, 0), key(2.5, 90, 'easeInOutCubic')]),
      track('cluster/opacity', 'number', [key(0, 0), key(0.6, 1, 'easeOutQuad')]),
      track('orb/fill', 'color', [key(0.5, '#e6a700'), key(2.5, '#7c4dff', 'easeInOutSine')]),
      track('pulse/scale', 'vec2', [
        key<Vec2>(0, [1, 1]),
        key<Vec2>(1.5, [2.2, 2.2], 'easeInOutBack'),
        key<Vec2>(3, [1, 1], 'easeInOutBack'),
      ]),
      track('panel/zIndex', 'number', [key(1.5, -1), key(1.501, 1, { interp: 'hold' })]),
    ],
  }),
};

export default mod;

/**
 * Golden corpus scene (DESIGN.md §7.3 tier 2): gradient Paint fills. Exercises
 * a static radial fill and a static linear fill (both with omitted geometry, so
 * the raster defaults to the path bounds), plus a keyframe-ANIMATED radial fill
 * that sweeps its center, grows its radius, and recolors over the timeline —
 * the `paint` value type interpolating on a track (§2.2). No blur filter: the
 * soft-light look is the gradient itself.
 */

import { key, timeline, track, type Paint } from '@glissade/core';
import { Rect, createScene, type SceneModule } from '@glissade/scene';

// keyframe endpoints: a small warm disc at left → a large cool disc at right
const radialA: Paint = {
  kind: 'radial',
  stops: [{ offset: 0, color: '#ffd86b' }, { offset: 1, color: '#1a0f2e' }],
  center: [-90, 0],
  radius: 70,
};
const radialB: Paint = {
  kind: 'radial',
  stops: [{ offset: 0, color: '#6bd0ff' }, { offset: 1, color: '#0a1a2e' }],
  center: [90, 0],
  radius: 170,
};

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0a0a12' }),
        // static radial — geometry omitted, so center/radius default to the bounds
        new Rect({
          id: 'sr',
          width: 150,
          height: 150,
          position: [110, 105],
          fill: { kind: 'radial', stops: [{ offset: 0, color: '#ff5d73' }, { offset: 1, color: '#12030a' }] },
        }),
        // static linear — from/to omitted, so it defaults to a vertical bounds sweep
        new Rect({
          id: 'sl',
          width: 150,
          height: 150,
          position: [110, 270],
          fill: { kind: 'linear', stops: [{ offset: 0, color: '#4ea1ff' }, { offset: 1, color: '#e6a700' }] },
        }),
        // keyframe-animated radial: base = radialA; the track tweens it to radialB
        new Rect({ id: 'anim', width: 380, height: 320, position: [430, 180], fill: radialA }),
      ],
    }),
  timeline: timeline({
    duration: 3,
    fps: 60,
    tracks: [track('anim/fill', 'paint', [key(0, radialA), key(3, radialB, 'easeInOutCubic')])],
  }),
};

export default mod;

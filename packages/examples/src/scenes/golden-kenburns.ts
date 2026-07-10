/**
 * Golden corpus (0.71): the `kenBurns()` per-node pan/zoom preset. A gradient-FILLED
 * Rect is pushed IN (`<id>/scale` 1 → 1.1) while it pans (`<id>/position` drifts) over
 * a few seconds — the classic Ken Burns move applied to ONE existing node (no camera rig).
 *
 * It's a Rect, not an Image, on purpose: it isolates kenBurns's track emission +
 * scale/position animation (byte-exact by construction) from image-DECODE determinism
 * (a separate perceptual contract), and it fits the DejaVu-only golden harness (no image
 * assets). The zoom/pan compile to ordinary vec2 keyframe tracks, so the whole frame
 * byte-compares on Skia in CI.
 *
 * kenBurns reads the Rect's STATIC constructed scale/position for the defaulted `from`
 * (the zoom is a tuple, the pan an offset), so the emitted tracks are a pure function of
 * (static props, args) and order-independent.
 */

import { timeline } from '@glissade/core';
import { Rect, createScene, type SceneModule } from '@glissade/scene';
import { kenBurns } from '@glissade/scene/motion';

const ID = 'photo';
const SIZE = { w: 520, h: 300 };
const CENTER: [number, number] = [320, 180];

/** the gradient-panel subject of the move; a fresh instance per call (scene purity). */
function makePhoto(): Rect {
  return new Rect({
    id: ID,
    width: SIZE.w,
    height: SIZE.h,
    position: CENTER,
    fill: {
      kind: 'linear',
      stops: [
        { offset: 0, color: '#ff8a3d' },
        { offset: 0.5, color: '#b34bd6' },
        { offset: 1, color: '#2b6bff' },
      ],
      from: [-260, -150],
      to: [260, 150],
    },
  });
}

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0a0a12' }),
        makePhoto(),
      ],
    }),
  // push in 1 → 1.1 while drifting up-left; the pan `from` defaults to the Rect's
  // STATIC constructed position ([320,180]), read off a representative instance.
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: kenBurns(makePhoto(), { zoom: [1, 1.1], pan: [-48, -28], duration: 3 }).tracks,
  }),
};

export default mod;

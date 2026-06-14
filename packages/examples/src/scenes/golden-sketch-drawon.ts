/**
 * Golden corpus: sketch draw-on. A marker rectangle and an ink circle stroke
 * THEMSELVES on as a `<id>/reveal` track runs 0→1 — implemented as a retreating
 * per-contour dash (StrokeStyle.dashOffset). Pure data, byte-compared on Skia.
 */

import { key, timeline, track } from '@glissade/core';
import { Circle, Rect, createScene, type SceneModule } from '@glissade/scene';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Rect({ id: 'box', width: 240, height: 150, position: [195, 180], stroke: '#4ea1ff', sketch: { kind: 'marker' }, sketchSeed: 11 }),
        new Circle({ id: 'ring', radius: 85, position: [475, 180], stroke: '#3ddc97', sketch: { kind: 'ink' }, sketchSeed: 5 }),
      ],
    }),
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [
      track('box/reveal', 'number', [key(0, 0), key(2.4, 1, 'easeInOutCubic')]),
      track('ring/reveal', 'number', [key(0.3, 0), key(2.6, 1, 'easeInOutCubic')]),
    ],
  }),
};

export default mod;

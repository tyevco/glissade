/**
 * Golden corpus: reveal draw-on for PLAIN (non-sketch) stroked shapes. A wave
 * Path (built via pathFromSegs — exercising the bridge) and a Rect both stroke
 * themselves on as a `<id>/reveal` track runs 0→1. Pure data, byte-compared on
 * Skia.
 */

import { key, timeline, track } from '@glissade/core';
import { Path, Rect, pathFromSegs, createScene, type SceneModule } from '@glissade/scene';

// an S-wave authored as PathSeg[] then bridged to a Path node's PathValue
const wave = pathFromSegs([
  ['M', 80, 180],
  ['Q', 200, 90, 320, 180],
  ['Q', 440, 270, 560, 180],
]);

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Path({ id: 'wave', data: wave, stroke: '#9ef0c0', strokeWidth: 4 }),
        new Rect({ id: 'box', width: 200, height: 120, position: [320, 180], stroke: '#4ea1ff', strokeWidth: 3 }),
      ],
    }),
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [
      track('wave/reveal', 'number', [key(0, 0), key(2.4, 1, 'easeInOutCubic')]),
      track('box/reveal', 'number', [key(0.3, 0), key(2.6, 1, 'easeInOutCubic')]),
    ],
  }),
};

export default mod;

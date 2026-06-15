/**
 * Golden corpus: the whiteboard kit. A marker box, a crayon circle, and a
 * pencil underline (its geometry bridged from PathSeg[] via pathFromSegs) draw
 * themselves on one after another via `drawOnEach` — sketch + reveal + stagger
 * composed. Pure data, byte-compared on Skia.
 */

import { timeline } from '@glissade/core';
import { Circle, Path, Rect, drawOnEach, pathFromSegs, createScene, type SceneModule } from '@glissade/scene';

const underline = pathFromSegs([
  ['M', 70, 300],
  ['Q', 200, 288, 330, 300],
]);

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Rect({ id: 'box', width: 190, height: 120, position: [165, 130], stroke: '#4ea1ff', sketch: { kind: 'marker' }, sketchSeed: 11 }),
        new Circle({ id: 'ring', radius: 74, position: [475, 130], stroke: '#3ddc97', sketch: { kind: 'crayon' }, sketchSeed: 7 }),
        new Path({ id: 'line', data: underline, stroke: '#ffd83d', strokeWidth: 4, sketch: { kind: 'pencil' }, sketchSeed: 3 }),
      ],
    }),
  timeline: timeline({
    fps: 60,
    duration: 4,
    tracks: drawOnEach(['box', 'ring', 'line'], { duration: 1, delay: 0.8 }),
  }),
};

export default mod;

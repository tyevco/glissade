/**
 * Golden corpus: hand-drawn sketch styles. A marker rectangle, a crayon circle,
 * and a pencil-outlined filled card — each outline geometrically roughened
 * (multi-pass jittered strokes) at a fixed seed. NOT golden-marker.ts (that's
 * the marker HIGHLIGHT, unrelated). Pure path math, byte-compared on Skia.
 */

import { timeline } from '@glissade/core';
import { Circle, Rect, createScene, type SceneModule } from '@glissade/scene';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        // marker outline (2 wide passes)
        new Rect({ id: 'mk', width: 180, height: 110, position: [170, 110], stroke: '#4ea1ff', sketch: { kind: 'marker' }, sketchSeed: 11 }),
        // crayon circle (3 built-up passes) — exercises the 'E' arc flattener
        new Circle({ id: 'cr', radius: 70, position: [470, 110], stroke: '#3ddc97', sketch: { kind: 'crayon' }, sketchSeed: 7 }),
        // a filled card with a pencil outline (solid fill UNDER rough strokes)
        new Rect({ id: 'pc', width: 240, height: 96, position: [320, 280], fill: '#2b2417', stroke: '#ffd83d', sketch: { kind: 'pencil' }, sketchSeed: 3 }),
      ],
    }),
  timeline: timeline({ fps: 60, duration: 1, tracks: [] }),
};

export default mod;

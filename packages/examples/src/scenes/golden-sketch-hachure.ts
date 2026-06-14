/**
 * Golden corpus: hachure fill — sketchy parallel hatching clipped to the shape
 * (the pencil/crayon "filled" look), under a roughened outline. Pure path math,
 * byte-compared on Skia.
 */

import { timeline } from '@glissade/core';
import { Circle, Rect, createScene, type SceneModule } from '@glissade/scene';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Rect({ id: 'card', width: 210, height: 140, position: [185, 180], stroke: '#ffd83d', sketch: { kind: 'pencil' }, sketchFill: { angleRad: Math.PI / 4, gap: 9 }, sketchSeed: 4 }),
        new Circle({ id: 'badge', radius: 82, position: [470, 180], stroke: '#4ea1ff', sketch: { kind: 'ink' }, sketchFill: { angleRad: -Math.PI / 4, gap: 8, roughness: 0.5 }, sketchSeed: 9 }),
      ],
    }),
  timeline: timeline({ fps: 60, duration: 1, tracks: [] }),
};

export default mod;

/**
 * Golden corpus (0.30): sampled motion blur. A fast dot streaks across the frame
 * wrapped in MotionBlur — it's rendered at N sub-frame times across the shutter and
 * AVERAGED (running-mean), so it smears exactly like an analog shutter while a
 * crisp reference dot above stays sharp. Pure multi-time re-eval (playhead
 * re-addressed per sample + restored), byte-compared on Skia in CI.
 */

import { key, timeline, track, type PathValue } from '@glissade/core';
import { Circle, Path, Rect, createScene, motionBlur, type SceneModule } from '@glissade/scene';

// a short horizontal track the crisp reference dot rides too (for contrast)
const rail: PathValue = [
  { closed: false, v: [[60, 130], [580, 130]], in: [[0, 0], [0, 0]], out: [[0, 0], [0, 0]] },
];

const mod: SceneModule = {
  createScene: () => {
    const fast = new Circle({ id: 'fast', radius: 20, fill: '#ffcf3f' });
    const crisp = new Circle({ id: 'crisp', radius: 20, fill: '#39e0ff' });
    return createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0a0e17' }),
        new Path({ id: 'rail', data: rail, stroke: '#1b2740', strokeWidth: 2 }),
        // crisp reference (no blur) on top
        crisp,
        // the SAME motion, sampled + averaged across a shutter → a smear below
        motionBlur(fast, { id: 'mb', shutter: 0.09, samples: 16 }),
      ],
    });
  },
  timeline: timeline({
    fps: 60,
    duration: 2,
    tracks: [
      // crisp rides the top rail; fast smears along a lower line, same left→right sweep
      track('crisp/position', 'vec2', [key(0, [60, 130]), key(2, [580, 130], 'easeInOutCubic')]),
      track('fast/position', 'vec2', [key(0, [60, 240]), key(2, [580, 240], 'easeInOutCubic')]),
    ],
  }),
};

export default mod;

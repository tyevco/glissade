/**
 * Golden corpus: ANIMATED variable-font axis (0.23 — the `fontAxes` value type).
 *
 * One Text on the real `Inconsolata Variable` face with a `fontAxes` TRACK
 * sweeping `wght` 100→900 across the timeline. Each sampled frame renders at a
 * DIFFERENT weight — the byte-exact golden is the proof the ANIMATED axis reaches
 * the glyphs on Skia (a dropped/static axis would render every frame identically,
 * the way the sibling `golden-variable-font` proves the STATIC passthrough). The
 * axis interpolates per-frame via `fontAxesType.lerp`, formatted to the CSS
 * `font-variation-settings` string at draw.
 */

import { key, timeline, track } from '@glissade/core';
import { Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const FAMILY = 'Inconsolata Variable';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0d1117' }),
        new Text({
          id: 'axis',
          text: 'weight sweep',
          fill: '#e6edf3',
          fontFamily: FAMILY,
          fontSize: 52,
          position: [50, 200],
          fontAxes: { wght: 100 }, // initial; the track sweeps it
        }),
      ],
    }),
  timeline: timeline(
    (tl) => {
      // wght 100 → 900 over [0,3]: each golden frame samples a distinct weight
      tl.tracks([track('axis/fontAxes', 'fontAxes', [key(0, { wght: 100 }), key(3, { wght: 900 }, 'easeInOutCubic')])]);
    },
    {
      fps: 60,
      duration: 3.5,
      assets: {
        'Inconsolata Variable': { kind: 'font', url: '../../assets/fonts/Inconsolata-Variable.ttf' },
      },
    },
  ),
};

export default mod;

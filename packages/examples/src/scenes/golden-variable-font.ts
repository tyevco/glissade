/**
 * Golden corpus: LIVE variable-font axis passthrough (DESIGN.md §3.6, 0.20).
 *
 * `Inconsolata-Variable.ttf` (OFL) is registered as a real variable face — NOT
 * instanced to a static sfnt (that is the separate `font-instanced` golden).
 * Three Text nodes share that one family at the SAME `fontSize`; only the
 * static `fontVariationSettings` axis differs:
 *
 *   - default (no axes; the face's default wght = 100, the thinnest weight)
 *   - `'"wght" 900'` (the heaviest weight)
 *   - `'"wght" 500'` (a mid weight unreachable by a discrete named instance)
 *
 * The 0.20 passthrough wires `Text.fontVariationSettings` → `FontSpec` →
 * `ctx.fontVariationSettings` on the Skia (`@napi-rs/canvas`) rasterizer, so the
 * three rows render DISTINCTLY — the byte-exact golden is the proof the axis
 * actually reaches the glyphs (a dropped/ignored axis would render all three
 * identically). Static only: animatable axes are deferred to 1.0.
 */

import { timeline } from '@glissade/core';
import { Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const FAMILY = 'Inconsolata Variable';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0d1117' }),
        // default axes (face default wght = 100): the thinnest rendering
        new Text({
          id: 'thin',
          text: 'wght default (100)',
          fill: '#e6edf3',
          fontFamily: FAMILY,
          fontSize: 30,
          position: [60, 110],
        }),
        // heavy axis via static passthrough — renders distinctly bolder
        new Text({
          id: 'heavy',
          text: 'wght 900 (axis)',
          fill: '#7ee787',
          fontFamily: FAMILY,
          fontSize: 30,
          fontVariationSettings: '"wght" 900',
          position: [60, 180],
        }),
        // a mid weight no discrete named instance reaches — the variable-axis win
        new Text({
          id: 'mid',
          text: 'wght 500 (axis)',
          fill: '#79c0ff',
          fontFamily: FAMILY,
          fontSize: 30,
          fontVariationSettings: '"wght" 500',
          position: [60, 250],
        }),
      ],
    }),
  timeline: timeline(
    (tl) => {
      // a trivial drift so multiple frames exercise the same axed faces
      tl.to('heavy/position', [100, 180], { duration: 1.5, ease: 'easeInOutCubic', at: 0.3, from: [60, 180] })
        .to('heavy/position', [60, 180], { duration: 1.5, ease: 'easeInOutCubic', at: '>' });
    },
    {
      fps: 60,
      duration: 3.5,
      assets: {
        // the REAL variable face — axes are applied live at raster time (§3.6)
        'Inconsolata Variable': { kind: 'font', url: '../../assets/fonts/Inconsolata-Variable.ttf' },
      },
    },
  ),
};

export default mod;

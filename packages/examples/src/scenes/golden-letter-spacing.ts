/**
 * Golden corpus: STATIC letter-spacing (tracking) passthrough (0.21).
 *
 * Three Text nodes share ONE family at the SAME `fontSize`; only the static
 * `letterSpacing` (px) differs:
 *
 *   - default (no tracking — byte-identical to a Text without the prop)
 *   - `letterSpacing: 14` (wide tracking)
 *   - `letterSpacing: -3` (tight/negative tracking)
 *
 * The 0.21 passthrough wires `Text.letterSpacing` → `FontSpec` →
 * `ctx.letterSpacing` on the Skia (`@napi-rs/canvas`) rasterizer (which honors
 * it in both render AND measure), so the three rows render at DISTINCT widths —
 * the byte-exact golden is the proof tracking actually reaches the glyphs (a
 * dropped/ignored value would render all three identically). Static only;
 * animatable tracking is out of scope for 0.21.
 */

import { timeline } from '@glissade/core';
import { Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const FAMILY = 'DejaVu Sans';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0d1117' }),
        // default (no tracking) — the byte-identical baseline row
        new Text({
          id: 'normal',
          text: 'TRACKING none',
          fill: '#e6edf3',
          fontFamily: FAMILY,
          fontSize: 32,
          position: [60, 110],
        }),
        // wide tracking — renders visibly spread, wider box
        new Text({
          id: 'wide',
          text: 'TRACKING wide',
          fill: '#7ee787',
          fontFamily: FAMILY,
          fontSize: 32,
          letterSpacing: 14,
          position: [60, 190],
        }),
        // negative tracking — renders tighter than the baseline
        new Text({
          id: 'tight',
          text: 'TRACKING tight',
          fill: '#79c0ff',
          fontFamily: FAMILY,
          fontSize: 32,
          letterSpacing: -3,
          position: [60, 270],
        }),
      ],
    }),
  timeline: timeline(
    (tl) => {
      // a trivial drift so multiple frames exercise the same tracked faces
      tl.to('wide/position', [100, 190], { duration: 1.5, ease: 'easeInOutCubic', at: 0.3, from: [60, 190] })
        .to('wide/position', [60, 190], { duration: 1.5, ease: 'easeInOutCubic', at: '>' });
    },
    {
      fps: 60,
      duration: 3.5,
      assets: { 'DejaVu Sans': { kind: 'font', url: '../../assets/fonts/DejaVuSans.ttf' } },
    },
  ),
};

export default mod;

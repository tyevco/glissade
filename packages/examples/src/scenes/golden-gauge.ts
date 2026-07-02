/**
 * Golden corpus (0.38): the radial data-viz stack. `Gauge()` fans a spec into
 * N stroked-arc zones + boundary ticks + a needle + separate labels (a pure
 * build-time fan-out, like Chart). The timeline drives the SCRIPTED-needle mode —
 * the needle overshoots into the left zone, whips to the right, then settles dead
 * center — while a zone dims independently of its label (the labels stay full-
 * brightness: zone opacity and label opacity are separate channels). Nothing runs
 * at play time — byte-compared on Skia in CI.
 */

import { key, timeline, track } from '@glissade/core';
import { Rect, createScene, type SceneModule } from '@glissade/scene';
import { Gauge } from '@glissade/scene/gauge';

const ID = 'gauge';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0a0e17' }),
        Gauge({
          id: ID,
          radius: 120,
          thickness: 20,
          gap: 2.5,
          position: [320, 250], // center low so the 180° arc fills the upper frame
          // the repo-pinned face (registered in the golden harness) — a golden
          // with text MUST use it, not 'sans-serif', to stay byte-portable across
          // machines (local ↔ CI); text rendering isn't portable otherwise.
          fontFamily: 'DejaVu Sans',
          zones: [
            { extent: [-90, -30], color: '#e6a700', label: 'BLIND' },
            { extent: [-30, 30], color: '#3ddc97', label: 'CALIBRATED' },
            { extent: [30, 90], color: '#ff5d73', label: 'RAGE' },
          ],
          needleAngle: 0,
        }).node,
      ],
    }),
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [
      // the scripted swing: rest → overshoot left (blind) → whip right (rage) → settle center
      track(`${ID}/needle/rotation`, 'number', [
        key(0, 0),
        key(0.6, -70, 'easeOutCubic'),
        key(1.4, 62, 'easeInOutCubic'),
        key(2.4, 0, 'easeInOutCubic'),
      ]),
      // the extreme zones dim once the needle has whipped through — and the LABELS
      // stay full-brightness (separate nodes, z-above), the independent-channels win.
      track(`${ID}/zone-0/opacity`, 'number', [key(1.4, 1), key(2, 0.35, 'easeInOutCubic')]),
      track(`${ID}/zone-2/opacity`, 'number', [key(1.4, 1), key(2, 0.35, 'easeInOutCubic')]),
    ],
  }),
};

export default mod;

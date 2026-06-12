/**
 * Golden corpus: anchors + the marker highlight. Bars grow FROM their anchor
 * (left edge rightward, bottom edge upward) with plain width/height tracks —
 * no position bookkeeping; a needle rotates around its anchored end; and a
 * wrapped paragraph gets a marker sweep driven by one 'hl/progress' track,
 * multiply-blended over a paper card. Byte-compared on Skia in CI.
 */

import { key, timeline, track } from '@glissade/core';
import { highlight, Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const FAMILY = 'DejaVu Sans';

const mod: SceneModule = {
  createScene: () => {
    const para = new Text({
      id: 'para',
      text: 'Animations are data: a pure function of time needs no replay, so every frame is addressable.',
      fill: '#2b2417',
      fontFamily: FAMILY,
      fontSize: 15,
      lineHeight: 1.45,
      width: 240,
      position: [336, 96],
    });
    return createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        // anchored growth: the left edge stays pinned, width does everything
        new Rect({ id: 'growRight', anchor: 'left', position: [40, 60], height: 22, cornerRadius: 8, fill: '#4ea1ff' }),
        new Rect({ id: 'growRight2', anchor: 'left', position: [40, 100], height: 22, cornerRadius: 8, fill: '#3ddc97' }),
        // bottom-anchored bars grow upward — a chart with no position tracks
        new Rect({ id: 'barA', anchor: [0, 1], position: [60, 320], width: 36, cornerRadius: 6, fill: '#e6a700' }),
        new Rect({ id: 'barB', anchor: [0, 1], position: [110, 320], width: 36, cornerRadius: 6, fill: '#ff5d73' }),
        new Rect({ id: 'barC', anchor: [0, 1], position: [160, 320], width: 36, cornerRadius: 6, fill: '#b07cff' }),
        // the pivot IS the anchor: a needle sweeping around its left end
        new Rect({ id: 'needle', anchor: 'left', position: [240, 290], width: 90, height: 6, cornerRadius: 3, fill: '#cdd3de' }),
        // paper card; marker multiplies over it, glyphs paint on top
        new Rect({ id: 'card', width: 280, height: 150, cornerRadius: 14, position: [456, 130], fill: '#f2ecdc' }),
        highlight(para, { id: 'hl', color: '#ffd83d', blend: 'multiply', cornerRadius: 5 }),
        para,
      ],
    });
  },
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [
      track('growRight/width', 'number', [key(0, 0), key(1.2, 360, 'easeOutCubic')]),
      track('growRight2/width', 'number', [key(0.3, 0), key(1.8, 220, 'easeOutCubic')]),
      track('barA/height', 'number', [key(0.2, 0), key(1.4, 150, 'easeOutCubic')]),
      track('barB/height', 'number', [key(0.4, 0), key(1.6, 220, 'easeOutCubic')]),
      track('barC/height', 'number', [key(0.6, 0), key(1.8, 100, 'easeOutCubic')]),
      track('needle/rotation', 'number', [key(0, 0), key(2.6, -90, 'easeInOutCubic')]),
      track('hl/progress', 'number', [key(0.5, 0), key(2.5, 1)]),
    ],
  }),
};

export default mod;

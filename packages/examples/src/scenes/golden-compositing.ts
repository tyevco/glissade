/**
 * Golden corpus (0.34): the compositing pair — clip on Group + TrackMatte.
 *
 * Left: a rounded-rect CARD whose group is clipped to the card region; a grid of
 * oversized colored tiles slides diagonally through it — pixels exist only inside
 * the card (the outline shows exactly where the clip bites). Center: an alpha
 * matte IRIS — three overlapping vivid circles revealed through a circle whose
 * radius animates open. Right: a LUMA wipe — color bars revealed by a sliding
 * soft white-to-black gradient bar (brightness = alpha via the shared kernel).
 * All three are ordinary tracks; byte-compared on Skia in CI.
 */

import { key, timeline, track } from '@glissade/core';
import { Circle, Group, Rect, createScene, trackMatte, type SceneModule } from '@glissade/scene';

const mod: SceneModule = {
  createScene: () => {
    // ── clip: a sliding tile grid visible only inside the card ──
    const tiles: Rect[] = [];
    const colors = ['#4ea1ff', '#3ddc97', '#e6a700', '#ff5d73', '#b07cff', '#39e0ff'];
    for (let i = 0; i < 6; i++) {
      tiles.push(
        new Rect({ id: `tile${i}`, width: 44, height: 44, cornerRadius: 8, position: [(i % 3) * 56 - 56, Math.floor(i / 3) * 56 - 28], fill: colors[i]! }),
      );
    }
    const slider = new Group({ id: 'slider', children: tiles });
    const card = new Group({ id: 'card', position: [110, 180], clip: { w: 140, h: 170, r: 18 }, children: [slider] });

    // ── alpha matte: an iris over three vivid circles ──
    const iris = trackMatte(
      new Group({
        id: 'art',
        children: [
          new Circle({ id: 'a1', radius: 44, position: [-22, -14], fill: '#ff5d73' }),
          new Circle({ id: 'a2', radius: 44, position: [22, -14], fill: '#39e0ff' }),
          new Circle({ id: 'a3', radius: 44, position: [0, 22], fill: '#e6a700' }),
        ],
      }),
      new Circle({ id: 'irisMask', radius: 8, fill: '#ffffff' }),
      { id: 'iris', position: [320, 180] },
    );

    // ── luma wipe: color bars revealed by a sliding soft gradient bar ──
    const bars: Rect[] = [];
    for (let i = 0; i < 4; i++) {
      bars.push(new Rect({ id: `bar${i}`, width: 150, height: 30, position: [0, i * 38 - 57], fill: colors[i + 1]! }));
    }
    const wipe = trackMatte(
      new Group({ id: 'barsG', children: bars }),
      new Rect({
        id: 'wipeMask',
        width: 220,
        height: 180,
        position: [-220, 0],
        // explicit HORIZONTAL axis (local px): trailing edge dark → leading soft-white,
        // so the slide reads as a left-to-right wipe with a feathered edge
        fill: { kind: 'linear', from: [-110, 0], to: [110, 0], stops: [{ offset: 0, color: '#000000' }, { offset: 0.7, color: '#ffffff' }, { offset: 1, color: '#ffffff' }] },
      }),
      { id: 'wipe', mode: 'luma', position: [530, 180] },
    );

    return createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0c1018' }),
        // the card outline shows exactly where the clip bites
        new Rect({ id: 'cardEdge', width: 148, height: 178, cornerRadius: 21, position: [110, 180], stroke: '#3a4763', strokeWidth: 3 }),
        card,
        iris,
        wipe,
      ],
    });
  },
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [
      // tiles slide diagonally through the clip window (and far past it)
      track('slider/position', 'vec2', [key(0, [-80, -90]), key(3, [80, 90], 'easeInOutSine')]),
      // the iris opens, holds, and closes
      track('irisMask/radius', 'number', [key(0.2, 8), key(1.4, 78, 'easeOutCubic'), key(2.2, 78), key(3, 26, 'easeInOutCubic')]),
      // the gradient bar wipes across the color bars
      track('wipeMask/position', 'vec2', [key(0.4, [-220, 0]), key(2.6, [140, 0], 'easeInOutCubic')]),
    ],
  }),
};

export default mod;

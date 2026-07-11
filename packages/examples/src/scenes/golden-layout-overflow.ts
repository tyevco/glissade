/**
 * Golden corpus (Cut 3): the LAYOUT_OVERFLOW showcase — the visual critique() catches
 * when a Layout child's rendered INK exceeds its computed flex SLOT. A STATIC scene (no
 * tracks) so it renders one deterministic frame across the whole grid: a real `Row` of
 * three cells where the MIDDLE cell carries a fat bright stroke. The Row sizes each cell
 * from its intrinsic box (stroke-free), so the stroke ink bleeds past the cell into the
 * gaps and out of the row band — exactly the "content bigger than its slot" defect
 * LAYOUT_OVERFLOW reports on the middle child.
 *
 * critique() is NOT run here (this is the RENDERED pixel proof); the diagnostic is
 * unit-tested in scene/test/critique.test.ts. Text is pinned to 'DejaVu Sans' — the
 * golden font — so it is byte-stable in CI. Needs the Yoga engine (the golden harness
 * loads it before evaluation, like every flexbox golden).
 */

import { timeline } from '@glissade/core';
import { Rect, Text, createScene, type SceneModule } from '@glissade/scene';
import { Row } from '@glissade/scene/layout';

const FAMILY = 'DejaVu Sans';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0c1018' }),
        new Text({
          id: 'title',
          text: 'LAYOUT_OVERFLOW',
          fill: '#cdd3de',
          fontFamily: FAMILY,
          fontSize: 22,
          position: [40, 56],
        }),
        new Text({
          id: 'subtitle',
          text: 'the middle cell’s stroke ink overflows the slot the Row reserved for it',
          fill: '#8b93a3',
          fontFamily: FAMILY,
          fontSize: 14,
          position: [40, 84],
        }),
        // a real horizontal flexbox Row: three 120×100 cells, gap 24, padding 16. Yoga
        // sizes each cell from its stroke-FREE intrinsic box, so the middle cell's fat
        // stroke bleeds out of its cell (into the gaps + past the row band) — a LAYOUT_OVERFLOW.
        Row({
          id: 'bar',
          position: [320, 210],
          width: 'auto',
          height: 'auto',
          gap: 24,
          padding: 16,
          children: [
            new Rect({ id: 'cellA', width: 120, height: 100, cornerRadius: 12, fill: '#3ddc97' }),
            // OVERFLOWING child: a fat 32px stroke overhangs the 120×100 slot by 16px each side.
            new Rect({
              id: 'cellB',
              width: 120,
              height: 100,
              cornerRadius: 12,
              fill: '#1b2436',
              stroke: '#ff5d73',
              strokeWidth: 32,
            }),
            new Rect({ id: 'cellC', width: 120, height: 100, cornerRadius: 12, fill: '#4ea1ff' }),
          ],
        }),
      ],
    }),
  // STATIC: no tracks. A 3s duration covers the golden frame grid (0..179 @ 60fps).
  timeline: timeline({ fps: 60, duration: 3, tracks: [] }),
};

export default mod;

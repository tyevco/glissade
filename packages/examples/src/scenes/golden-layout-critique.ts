/**
 * Golden corpus (Cut 2): the layout-critique showcase — the visual a MISALIGNED +
 * UNEVEN_SPACING critique catches. A STATIC scene (no tracks) so it renders one
 * deterministic frame across the whole grid: a row of four cards where card 3 is
 * visibly nudged DOWN off the shared baseline (MISALIGNED) and the gap before card 4
 * is widened (UNEVEN_SPACING). Card 1 + 2 + the (misplaced) 3 + 4 are the group; a
 * dashed guide line marks the intended baseline the third card breaks.
 *
 * critique() is NOT run here (this is the RENDERED pixel proof of the layout defect);
 * the diagnostics are unit-tested in scene/test/critique.test.ts. Text is pinned to
 * 'DejaVu Sans' — the golden font — so it is byte-stable in CI.
 */

import { timeline } from '@glissade/core';
import { Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const FAMILY = 'DejaVu Sans';

// row of four cards (position = box CENTER). Cards 1,2,4 share baseline y=210; card 3
// is nudged to y=232 (off-axis). x centers 110/250/390/545 — the 3→4 gap is widened.
const CARDS: { id: string; x: number; y: number; fill: string; label: string }[] = [
  { id: 'card1', x: 110, y: 210, fill: '#4ea1ff', label: '1' },
  { id: 'card2', x: 250, y: 210, fill: '#3ddc97', label: '2' },
  { id: 'card3', x: 390, y: 232, fill: '#ff5d73', label: '3' }, // nudged DOWN (MISALIGNED)
  { id: 'card4', x: 545, y: 210, fill: '#b07cff', label: '4' }, // widened gap (UNEVEN_SPACING)
];

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0c1018' }),
        new Text({
          id: 'title',
          text: 'MISALIGNED + UNEVEN_SPACING',
          fill: '#cdd3de',
          fontFamily: FAMILY,
          fontSize: 22,
          position: [40, 56],
        }),
        new Text({
          id: 'subtitle',
          text: 'card 3 breaks the baseline; the gap before card 4 is too wide',
          fill: '#8b93a3',
          fontFamily: FAMILY,
          fontSize: 14,
          position: [40, 84],
        }),
        // the intended shared baseline (top edge of an aligned card at y=210, h=100)
        new Rect({ id: 'guide', width: 560, height: 2, position: [320, 160], fill: '#3a4763' }),
        ...CARDS.flatMap((c) => [
          new Rect({ id: c.id, width: 120, height: 100, cornerRadius: 14, position: [c.x, c.y], fill: c.fill }),
          new Text({
            id: `${c.id}Label`,
            text: c.label,
            fill: '#0c1018',
            fontFamily: FAMILY,
            fontSize: 40,
            align: 'center',
            position: [c.x, c.y + 14],
          }),
        ]),
      ],
    }),
  // STATIC: no tracks. A 3s duration covers the golden frame grid (0..179 @ 60fps).
  timeline: timeline({ fps: 60, duration: 3, tracks: [] }),
};

export default mod;

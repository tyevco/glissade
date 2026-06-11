/**
 * Golden corpus #4: flexbox layout (DESIGN.md §3.2). Yoga computes the same
 * boxes in browser preview and headless export, so these frames byte-compare
 * in CI like everything else. The gap and container width are animated
 * tracks — layout re-computes purely as they tween.
 */

import { timeline } from '@glissade/core';
import { Circle, Rect, Text, createScene, type SceneModule } from '@glissade/scene';
import { Layout } from '@glissade/scene/layout';

const FAMILY = 'DejaVu Sans';

const tile = (id: string, color: string, label: string) =>
  new Layout({
    id,
    width: 150,
    height: 150,
    direction: 'column',
    gap: 14,
    justify: 'center',
    align: 'center',
    children: [
      new Circle({ id: `${id}-dot`, radius: 28, fill: color }),
      new Text({ id: `${id}-label`, text: label, fill: '#cdd3de', fontFamily: FAMILY, fontSize: 15, align: 'center' }),
    ],
  });

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Rect({ id: 'panel', width: 560, height: 220, cornerRadius: 16, position: [320, 190], fill: '#1a1e27' }),
        new Layout({
          id: 'tiles',
          width: 520,
          height: 180,
          direction: 'row',
          gap: 16,
          justify: 'center',
          align: 'center',
          position: [320, 190],
          children: [
            tile('t1', '#e6a700', 'signals'),
            tile('t2', '#4ea1ff', 'tracks'),
            tile('t3', '#3ddc97', 'evaluate'),
          ],
        }),
        new Text({
          id: 'title',
          text: 'flexbox, deterministically',
          fill: '#8b93a3',
          fontFamily: FAMILY,
          fontSize: 16,
          align: 'center',
          position: [320, 56],
        }),
      ],
    }),
  timeline: timeline(
    (tl) => {
      tl.to('tiles/gap', 90, { duration: 1.3, ease: 'easeInOutCubic', at: 0.3, from: 16 })
        .to('tiles/gap', 16, { duration: 1.3, ease: 'easeInOutCubic', at: '+=0.2' })
        .to('t2/height', 110, { duration: 1, ease: 'easeInOutSine', at: 0.6, from: 150 })
        .to('t2/height', 150, { duration: 1, ease: 'easeInOutSine', at: '>' });
    },
    {
      fps: 60,
      duration: 3.2,
      assets: { 'DejaVu Sans': { kind: 'font', url: '../../assets/fonts/DejaVuSans.ttf' } },
    },
  ),
};

export default mod;

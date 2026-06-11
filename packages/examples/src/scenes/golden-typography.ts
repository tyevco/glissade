/**
 * Golden corpus #3: typography (DESIGN.md §3.6). Text IS golden-safe here
 * because the face is explicit — DejaVu Sans ships with the repo and
 * @napi-rs/canvas rasterizes it with its bundled FreeType, so frames are
 * byte-exact on any machine with the pinned toolchain. Exercises wrapping,
 * alignment, lineHeight, animated wrap width, and cornerRadius pills.
 */

import { timeline } from '@glissade/core';
import { Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const FAMILY = 'DejaVu Sans';
const SAMPLE =
  'Animations are data: a pure function of time needs no replay, so every frame is addressable.';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Rect({
          id: 'card',
          width: 380,
          height: 210,
          cornerRadius: 18,
          position: [220, 180],
          fill: '#1d212b',
        }),
        new Text({
          id: 'body',
          text: SAMPLE,
          fill: '#cdd3de',
          fontFamily: FAMILY,
          fontSize: 17,
          lineHeight: 1.4,
          width: 330,
          position: [56, 110],
        }),
        new Rect({
          id: 'pill',
          width: 150,
          height: 44,
          cornerRadius: 22,
          position: [510, 120],
          fill: '#e6a700',
        }),
        new Text({
          id: 'pillLabel',
          text: 'byte-exact',
          fill: '#15161a',
          fontFamily: FAMILY,
          fontSize: 16,
          align: 'center',
          position: [510, 126],
        }),
        new Text({
          id: 'right',
          text: 'aligned right',
          fill: '#8b93a3',
          fontFamily: FAMILY,
          fontSize: 14,
          align: 'right',
          position: [600, 320],
        }),
      ],
    }),
  timeline: timeline(
    (tl) => {
      // animate the wrap width: re-breaking is pure, so this scrubs perfectly
      tl.to('body/width', 180, { duration: 1.4, ease: 'easeInOutCubic', at: 0.3, from: 330 })
        .to('body/width', 330, { duration: 1.4, ease: 'easeInOutCubic', at: '+=0.2' })
        .to('pill/cornerRadius', 4, { duration: 1.5, at: 0.5, from: 22 })
        .to('pill/cornerRadius', 22, { duration: 1.5, at: '>' });
    },
    {
      fps: 60,
      duration: 3.5,
      assets: { 'DejaVu Sans': { kind: 'font', url: '../../assets/fonts/DejaVuSans.ttf' } },
    },
  ),
};

export default mod;

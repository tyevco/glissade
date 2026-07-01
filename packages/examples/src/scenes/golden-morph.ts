/**
 * Golden corpus scene (DESIGN.md §7.3 tier 2): the 0.13 shared-element box-FLIP
 * `morph()`. A small "chip" Rect grows into a large "document" Rect — the
 * consumer's send-line agency moment. A shared `morphFx` Rect (authored at the
 * document's size) carries the position+scale FLIP between the two boxes while
 * the chip cross-fades out and the document cross-fades in. The whole thing
 * compiles to ordinary keyed vec2/number tracks via `morph(...).tracks`, so the
 * frame stays a pure function of time and byte-compares on Skia.
 */

import { key, timeline, track, type Track } from '@glissade/core';
import { morph, type Box } from '@glissade/core/clips';
import { Rect, createScene, type SceneModule } from '@glissade/scene';

const chipBox: Box = { x: 150, y: 180, w: 120, h: 36 };
const docBox: Box = { x: 320, y: 180, w: 420, h: 240 };

// crossfade 0.25: the chip drops out fast and the document only fades in over
// the LAST quarter of the FLIP — while the carrier nearly covers it (an earlier
// fade-in let the full-size document peek out around the still-scaling carrier)
const { tracks } = morph(
  chipBox,
  docBox,
  { morphNode: 'morphFx', fromNode: 'chip', toNode: 'document' },
  { at: 0.5, duration: 1.2, ease: 'easeInOutCubic', crossfade: 0.25 },
);
// FLIP completion swap: the carrier vanishes as the morph lands, REVEALING the
// real document underneath (before this, morphFx sat on top forever and the
// promised cross-fade to the document was never visible)
const morphEnd = 0.5 + 1.2;
tracks.push(
  track('morphFx/opacity', 'number', [key(morphEnd, 1), key(morphEnd + 0.15, 0, 'easeOutQuad')]),
);

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0d1018' }),
        // the document: full size, hidden until the morph fades it in
        new Rect({
          id: 'document',
          width: docBox.w,
          height: docBox.h,
          position: [docBox.x, docBox.y],
          fill: '#e8ecf4',
          opacity: 0,
        }),
        // the chip: the small starting element
        new Rect({
          id: 'chip',
          width: chipBox.w,
          height: chipBox.h,
          position: [chipBox.x, chipBox.y],
          fill: '#5b8cff',
          opacity: 1,
        }),
        // the shared morph element: authored at the DOCUMENT size, so its end
        // scale is [1,1]; the FLIP starts it inverted to the chip's box
        new Rect({
          id: 'morphFx',
          width: docBox.w,
          height: docBox.h,
          position: [docBox.x, docBox.y],
          fill: '#5b8cff',
        }),
      ],
    }),
  timeline: timeline({
    duration: 2,
    fps: 60,
    tracks: tracks as Track[],
  }),
};

export default mod;

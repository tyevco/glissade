/**
 * Golden corpus: an INSTANCED variable font (DESIGN.md §3.6, 0.12 font front
 * door). `Inconsolata-Variable.ttf` (OFL) is instanced ONCE, at ingest time, at
 * a fixed axis tuple (wght 600, wdth 100) into the committed STATIC sfnt
 * `Inconsolata-wght600.ttf`. From there on it is an ordinary static face — both
 * backends rasterize that same static sfnt, so variable-font support collapses
 * to the already-solved static-font parity problem (no live per-frame axis
 * instancing at render time; animatable axes stay deferred).
 *
 * Because the face is static and explicit, frames byte-compare on the pinned
 * Skia toolchain exactly like the DejaVu typography golden, AND the scene joins
 * the browser↔Skia SSIM parity suite — the two gating proofs for the card.
 */

import { timeline } from '@glissade/core';
import { Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const FAMILY = 'Inconsolata Semibold';
const SAMPLE = 'wght 600 instanced 0123';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0d1117' }),
        new Text({
          id: 'title',
          text: 'Variable -> static',
          fill: '#e6edf3',
          fontFamily: FAMILY,
          fontSize: 34,
          position: [60, 120],
        }),
        new Text({
          id: 'sample',
          text: SAMPLE,
          fill: '#7ee787',
          fontFamily: FAMILY,
          fontSize: 26,
          position: [60, 190],
        }),
        new Text({
          id: 'note',
          text: 'one content-hashed sfnt; both backends agree',
          fill: '#8b949e',
          fontFamily: FAMILY,
          fontSize: 15,
          position: [60, 250],
        }),
      ],
    }),
  timeline: timeline(
    (tl) => {
      // a trivial animation so multiple frames exercise the same static face
      tl.to('sample/position', [110, 190], { duration: 1.5, ease: 'easeInOutCubic', at: 0.3, from: [60, 190] })
        .to('sample/position', [60, 190], { duration: 1.5, ease: 'easeInOutCubic', at: '>' });
    },
    {
      fps: 60,
      duration: 3.5,
      // the committed STATIC instance produced by `registerFont`/ingestFont at a
      // fixed axis tuple — referenced as an ordinary static font asset.
      assets: {
        'Inconsolata Semibold': { kind: 'font', url: '../../assets/fonts/Inconsolata-wght600.ttf' },
      },
    },
  ),
};

export default mod;

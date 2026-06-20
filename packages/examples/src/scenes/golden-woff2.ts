/**
 * Golden corpus: a WOFF2-DECODED face (0.13, DsW-aD_OUMoV item 1 — the named
 * Fontsource woff2 pain). `Inconsolata-wght600.woff2` (a woff2 of the in-repo
 * OFL `Inconsolata-wght600.ttf`) is decoded ONCE, at ingest time, to a plain
 * static sfnt by the font front door (`ingestFont`: sniff woff2 magic →
 * fontverter decode → parseCmap). From there it is an ordinary static face —
 * Skia rasterizes that decoded sfnt, so woff2 support collapses to the
 * already-solved static-font parity problem (no decode at render time; the
 * decode is byte-stable run-to-run, asserted by the unit gate).
 *
 * The golden test registers the DECODED sfnt bytes with Skia `GlobalFonts`
 * under FAMILY (see golden.test.ts), exactly like the instanced face — proving
 * the decode path is byte-stable end to end through the rasterizer.
 */

import { timeline } from '@glissade/core';
import { Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const FAMILY = 'Inconsolata WOFF2';
const SAMPLE = 'woff2 decode 0123';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0d1117' }),
        new Text({
          id: 'title',
          text: 'woff2 -> sfnt',
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
          text: 'decoded once at ingest; byte-stable sfnt',
          fill: '#8b949e',
          fontFamily: FAMILY,
          fontSize: 15,
          position: [60, 250],
        }),
      ],
    }),
  timeline: timeline(
    (tl) => {
      // a trivial animation so multiple frames exercise the same decoded face
      tl.to('sample/position', [110, 190], { duration: 1.5, ease: 'easeInOutCubic', at: 0.3, from: [60, 190] })
        .to('sample/position', [60, 190], { duration: 1.5, ease: 'easeInOutCubic', at: '>' });
    },
    {
      fps: 60,
      duration: 3.5,
      // the static sfnt produced by `ingestFont` decoding the committed woff2 —
      // referenced as an ordinary static font asset (the decoded bytes are
      // registered with the rasterizer by the harness).
      assets: {
        'Inconsolata WOFF2': { kind: 'font', url: '../../assets/fonts/Inconsolata-wght600.woff2' },
      },
    },
  ),
};

export default mod;

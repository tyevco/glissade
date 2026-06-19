/**
 * Gradient Paint showcase (0.10.1) — a labelled tour of every gradient
 * capability, animated and loopable (8s ping-pong). Render it to video:
 *   gs render packages/examples/src/scenes/showcase-gradients.ts \
 *     --out gradient-showcase.mp4 --fps 30 --workers 4
 *
 * Panels: (1) radial fill, (2) linear fill, (3) interpolation modes
 * linear|smooth|gaussian, (4) keyframe gradient morph, (5) solid-color → gradient
 * lift, (6) an aurora of drifting gaussian soft-light blobs (the vibrant-bg use
 * case) — all as fills, no blur filter.
 */

import { key, timeline, track, type Paint } from '@glissade/core';
import { Circle, Group, Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const FAMILY = 'DejaVu Sans';
const W = 1280;
const H = 720;
const BG = '#0a0a14';

// panel centres (3 cols × 2 rows)
const CX = [250, 640, 1040];
const ROW = [262, 542];

const label = (id: string, text: string, x: number, y: number, size = 22, fill = '#c7ccda') =>
  new Text({ id, text, fill, fontFamily: FAMILY, fontSize: size, align: 'center', position: [x, y] });

// ---- gradient values ----------------------------------------------------
const interpStops = [{ offset: 0, color: '#ffd86b' }, { offset: 1, color: '#1a0f2e' }];
// keyframe-morph endpoints (sweep + grow + recolour)
const morphA: Paint = { kind: 'radial', stops: [{ offset: 0, color: '#ffd86b' }, { offset: 1, color: '#1a0f2e' }], center: [-70, 0], radius: 70, interpolation: 'gaussian' };
const morphB: Paint = { kind: 'radial', stops: [{ offset: 0, color: '#6bd0ff' }, { offset: 1, color: '#0a1a2e' }], center: [70, 0], radius: 150, interpolation: 'gaussian' };
// solid-colour → gradient lift endpoints
const liftColor: Paint = { kind: 'color', color: '#ff5d73' };
const liftGrad: Paint = { kind: 'radial', stops: [{ offset: 0, color: '#ffffff' }, { offset: 0.5, color: '#ff5d73' }, { offset: 1, color: '#2a0512' }], radius: 92, interpolation: 'smooth' };
// aurora blob fills (soft gaussian discs, additive via screen blend)
const blob = (c0: string, c1: string): Paint => ({ kind: 'radial', stops: [{ offset: 0, color: c0 }, { offset: 1, color: c1 }], radius: 130, interpolation: 'gaussian' });

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: W, h: H },
      children: [
        new Rect({ id: 'bg', width: W, height: H, position: [W / 2, H / 2], fill: BG }),
        label('title', 'glissade  ·  gradient Paint', W / 2, 52, 34, '#eef1f7'),
        label('subtitle', 'soft-light fills — no blur filter, animatable, deterministic', W / 2, 84, 18, '#7f8799'),

        // (1) radial fill ------------------------------------------------
        label('l1', 'radial fill', CX[0]!, ROW[0]! - 132),
        new Circle({ id: 'radial', radius: 96, position: [CX[0]!, ROW[0]!], fill: { kind: 'radial', stops: [{ offset: 0, color: '#ffe39a' }, { offset: 1, color: '#3a1d5e' }], center: [-26, -20], radius: 120, interpolation: 'gaussian' } }),

        // (2) linear fill (multi-stop, diagonal) -------------------------
        label('l2', 'linear fill', CX[1]!, ROW[0]! - 132),
        new Rect({ id: 'linear', width: 240, height: 170, cornerRadius: 14, position: [CX[1]!, ROW[0]!], fill: { kind: 'linear', stops: [{ offset: 0, color: '#4ea1ff' }, { offset: 0.5, color: '#9b8cff' }, { offset: 1, color: '#ffb86b' }], from: [-120, -85], to: [120, 85], interpolation: 'smooth' } }),

        // (3) interpolation modes ---------------------------------------
        label('l3', 'interpolation: linear · smooth · gaussian', CX[2]!, ROW[0]! - 132),
        new Circle({ id: 'iLin', radius: 52, position: [CX[2]! - 110, ROW[0]!], fill: { kind: 'radial', stops: interpStops, radius: 52, interpolation: 'linear' } }),
        new Circle({ id: 'iSmo', radius: 52, position: [CX[2]!, ROW[0]!], fill: { kind: 'radial', stops: interpStops, radius: 52, interpolation: 'smooth' } }),
        new Circle({ id: 'iGau', radius: 52, position: [CX[2]! + 110, ROW[0]!], fill: { kind: 'radial', stops: interpStops, radius: 52, interpolation: 'gaussian' } }),

        // (4) keyframe gradient morph ------------------------------------
        label('l4', 'keyframe morph', CX[0]!, ROW[1]! - 132),
        new Rect({ id: 'morph', width: 320, height: 188, cornerRadius: 16, position: [CX[0]!, ROW[1]!], fill: morphA }),

        // (5) solid colour → gradient lift -------------------------------
        label('l5', 'color → gradient', CX[1]!, ROW[1]! - 132),
        new Circle({ id: 'lift', radius: 94, position: [CX[1]!, ROW[1]!], fill: liftColor }),

        // (6) aurora: drifting gaussian soft-light blobs -----------------
        label('l6', 'aurora (drifting soft light)', CX[2]!, ROW[1]! - 132),
        new Group({
          id: 'aurora',
          position: [CX[2]!, ROW[1]!],
          children: [
            new Rect({ id: 'auroraBg', width: 330, height: 196, cornerRadius: 16, position: [0, 0], fill: '#070710' }),
            // dim inner colors so the screen-blended overlap reads as colored
            // aurora light, not a white blowout
            new Circle({ id: 'blobA', radius: 70, position: [-80, -30], blend: 'screen', fill: blob('#7a2236', '#050509') }),
            new Circle({ id: 'blobB', radius: 80, position: [70, 10], blend: 'screen', fill: blob('#214a78', '#050509') }),
            new Circle({ id: 'blobC', radius: 64, position: [10, 40], blend: 'screen', fill: blob('#7a6428', '#050509') }),
          ],
        }),
      ],
    }),
  timeline: timeline({
    fps: 30,
    duration: 8,
    assets: { [FAMILY]: { kind: 'font', url: '../../assets/fonts/DejaVuSans.ttf' } },
    tracks: [
      // (4) morph the gradient A → B → A (ping-pong, clean loop)
      track('morph/fill', 'paint', [key(0, morphA), key(4, morphB, 'easeInOutCubic'), key(8, morphA, 'easeInOutCubic')]),
      // (5) lift a solid colour into a radial gradient and back (mixed color +
      // radial keys → annotate Key<Paint> so the union doesn't narrow to one kind)
      track('lift/fill', 'paint', [key<Paint>(0, liftColor), key<Paint>(4, liftGrad, 'easeInOutCubic'), key<Paint>(8, liftColor, 'easeInOutCubic')]),
      // (6) drift the aurora blobs (cheap per-frame translate — no re-raster of the gradient)
      track('blobA/position.x', 'number', [key(0, -80), key(4, 60, 'easeInOutSine'), key(8, -80, 'easeInOutSine')]),
      track('blobA/position.y', 'number', [key(0, -30), key(4, 40, 'easeInOutSine'), key(8, -30, 'easeInOutSine')]),
      track('blobB/position.x', 'number', [key(0, 70), key(4, -60, 'easeInOutSine'), key(8, 70, 'easeInOutSine')]),
      track('blobC/position.y', 'number', [key(0, 40), key(4, -36, 'easeInOutSine'), key(8, 40, 'easeInOutSine')]),
    ],
  }),
};

export default mod;

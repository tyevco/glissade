/**
 * THE round-trip gate (in-process, no lottie-web / browser): a mappable scene
 * (Rect with cubicBezier position/rotation/opacity tracks) is exported to Lottie,
 * re-imported through the SHIPPED importer, and BOTH scenes are rendered on Skia.
 * The perceptual SSIM at several frames must stay ≥ 0.98 — the export↔import
 * bijection, exercised directly.
 *
 * Uses only cubicBezier + hold + linear eases and solid fills (the exactly-
 * invertible subset), so the round trip is faithful by construction.
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { key, track, type Timeline } from '@glissade/core';
import { createScene, evaluate, Rect, Text, type SceneModule } from '@glissade/scene';
import { SkiaBackend, ssim, createMeasurer } from '@glissade/backend-skia';
import { exportLottie } from '../src/export.js';
import { importLottie } from '../src/index.js';

const W = 240;
const H = 240;
const FPS = 60;

// Register the golden test face process-wide (side effect) so the Text round-trip
// actually rasterizes real glyphs — otherwise both renders would draw nothing and
// the SSIM gate would pass vacuously. 'DejaVu Sans' is the golden corpus's pinned
// family (memory: sans-serif diverges byte-wise in CI; a real registered face is
// stable). Both scenes reference it, so the export→import→render loop is exercised.
const FAMILY = 'DejaVu Sans';
createMeasurer({ fonts: { [FAMILY]: fileURLToPath(new URL('../../examples/assets/fonts/DejaVuSans.ttf', import.meta.url)) } });

/** A Rect animated on position (cubicBezier), rotation, and opacity + a hold tail. */
function mappableScene(): SceneModule {
  const timeline: Timeline = {
    version: 1,
    duration: 2,
    fps: FPS,
    tracks: [
      track('box/position', 'vec2', [
        key(0, [60, 70]),
        key(1, [180, 160], { kind: 'cubicBezier', pts: [0.42, 0, 0.58, 1] }),
        key(2, [120, 120], { interp: 'hold' }),
      ]),
      track('box/rotation', 'number', [key(0, 0), key(2, 90, { kind: 'cubicBezier', pts: [0.4, 0.1, 0.6, 0.9] })]),
      track('box/opacity', 'number', [key(0, 1), key(1.5, 0.4)]),
    ],
  };
  return {
    createScene: () =>
      createScene({ size: { w: W, h: H }, children: [new Rect({ id: 'box', width: 70, height: 50, fill: '#3366cc' })] }),
    timeline,
  };
}

async function renderPixels(mod: SceneModule, t: number): Promise<Uint8ClampedArray> {
  const scene = mod.createScene();
  const backend = new SkiaBackend(W, H);
  scene.setTextMeasurer(backend);
  backend.render(evaluate(scene, mod.timeline, t));
  return backend.readPixels();
}

describe('Lottie export round-trip (Skia SSIM)', () => {
  const original = mappableScene();
  const doc = exportLottie(original, { width: W, height: H, fps: FPS });
  const roundTripped = importLottie(doc).toSceneModule();

  it('re-imports without audit rejections and preserves the animated channels', () => {
    // the importer produced tracks for the mapped props (renamed node ids aside)
    const types = roundTripped.timeline.tracks.map((t) => t.type).sort();
    expect(types).toContain('vec2'); // position
    expect(types).toContain('number'); // rotation / opacity
    expect(roundTripped.timeline.tracks.length).toBeGreaterThan(0);
  });

  const FRAMES = [0, 20, 40, 60, 80, 100, 119];
  it.each(FRAMES)('frame %i matches the original perceptually (SSIM ≥ 0.98)', async (frame) => {
    const t = frame / FPS;
    const a = await renderPixels(original, t);
    const b = await renderPixels(roundTripped, t);
    const score = ssim(a, b, W, H);
    expect(score).toBeGreaterThanOrEqual(0.98);
  });
});

/** A static centered Text — one text document, no tracks. */
function staticTextScene(): SceneModule {
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [new Text({ id: 'label', text: 'Glissade', fill: '#e8462b', fontSize: 40, fontFamily: FAMILY, align: 'center', position: [120, 130] })],
      }),
    timeline: { version: 1, duration: 1, fps: FPS, tracks: [] },
  };
}

/** A Text animated on position (cubicBezier) and fill (color) — doc keyframes + transform. */
function animatedTextScene(): SceneModule {
  const timeline: Timeline = {
    version: 1,
    duration: 2,
    fps: FPS,
    tracks: [
      track('label/position', 'vec2', [key(0, [70, 110]), key(2, [150, 140], { kind: 'cubicBezier', pts: [0.42, 0, 0.58, 1] })]),
      track('label/fill', 'color', [key(0, '#2b7fe8'), key(2, '#e8462b')]),
    ],
  };
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [new Text({ id: 'label', text: 'Motion', fill: '#2b7fe8', fontSize: 44, fontFamily: FAMILY, align: 'center' })],
      }),
    timeline,
  };
}

describe('Lottie Text export round-trip (Skia SSIM)', () => {
  it('static text re-imports as a Text node and matches perceptually (SSIM ≥ 0.98)', async () => {
    const original = staticTextScene();
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    expect(doc.layers.some((l) => l.ty === 5)).toBe(true);
    const roundTripped = importLottie(doc).toSceneModule();
    const a = await renderPixels(original, 0);
    const b = await renderPixels(roundTripped, 0);
    expect(ssim(a, b, W, H)).toBeGreaterThanOrEqual(0.98);
  });

  it('animated fill+position text matches at sampled frames (SSIM ≥ 0.98)', async () => {
    const original = animatedTextScene();
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    const roundTripped = importLottie(doc).toSceneModule();
    for (const frame of [0, 30, 60, 90, 119]) {
      const t = frame / FPS;
      const a = await renderPixels(original, t);
      const b = await renderPixels(roundTripped, t);
      expect(ssim(a, b, W, H), `frame ${frame}`).toBeGreaterThanOrEqual(0.98);
    }
  });
});

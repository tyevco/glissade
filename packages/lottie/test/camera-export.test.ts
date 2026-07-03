/**
 * Camera pose → Lottie round-trip (0.55, canary parity gate). The camera pose
 * (zoom/center/roll) lives in a custom draw transform, NOT the node's p/s/r — so
 * the exporter must be camera-aware and bake the per-layer inverse pose into the
 * null-parent hierarchy. Before the fix the pose vanished SILENTLY (null ks
 * scale=100 for a zoom of 1.5, children un-zoomed). These tests pin the ks
 * decomposition AND the export→import→render SSIM.
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { key, track, type Timeline } from '@glissade/core';
import { Circle, createScene, evaluate, type SceneModule } from '@glissade/scene';
import { camera, shake } from '@glissade/scene/motion';
import { SkiaBackend, ssim, createMeasurer } from '@glissade/backend-skia';
import { exportLottie } from '../src/export.js';
import { importLottie } from '../src/index.js';
import type { LottieLayer, LottieProp } from '../src/types.js';

const W = 240;
const H = 240;
const FPS = 60;

// register a face so any incidental text measures; the camera scene is shape-only.
createMeasurer({ fonts: { 'DejaVu Sans': fileURLToPath(new URL('../../examples/assets/fonts/DejaVuSans.ttf', import.meta.url)) } });

/** A single dot centered in a camera rig; static or animated zoom, no shake. */
function cameraScene(zoom: number | 'anim'): SceneModule {
  const timeline: Timeline =
    zoom === 'anim'
      ? { version: 1, duration: 1, fps: FPS, tracks: [track('cam/zoom', 'number', [key(0, 1), key(1, 1.5)])] }
      : { version: 1, duration: 1, fps: FPS, tracks: [] };
  return {
    createScene: () => {
      const dot = new Circle({ id: 'dot', radius: 40, position: [120, 120], fill: '#3366cc' });
      const cam = camera([{ content: dot }], { id: 'cam', ...(zoom === 'anim' ? {} : { zoom }) });
      return createScene({ size: { w: W, h: H }, children: [cam] });
    },
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

const poseSubNull = (doc: { layers: LottieLayer[] }): LottieLayer =>
  doc.layers.find((l) => l.ty === 3 && /-layer\d+$/.test(l.nm ?? ""))!;

describe('Camera pose → Lottie null-parent ks', () => {
  it('a STATIC zoom 1.5 exports null-parent ks scale [150,150] (the canary repro — was 100)', () => {
    const doc = exportLottie(cameraScene(1.5), { width: W, height: H, fps: FPS });
    const sub = poseSubNull(doc);
    expect(sub).toBeDefined();
    // decomposed pose: scale = zoom×100, translate = screenCenter − scale·focal
    expect((sub.ks!.s as LottieProp).a).toBe(0);
    expect((sub.ks!.s as LottieProp).k).toEqual([150, 150]);
    expect((sub.ks!.p as LottieProp).k).toEqual([-60, -60]);
    expect((sub.ks!.r as LottieProp).k).toBe(0);
  });

  it('an ANIMATED cam/zoom 1→1.5 exports sampled ks scale KEYFRAMES', () => {
    const doc = exportLottie(cameraScene('anim'), { width: W, height: H, fps: FPS });
    const sub = poseSubNull(doc);
    const s = sub.ks!.s as LottieProp;
    expect(s.a).toBe(1); // animated
    expect(Array.isArray(s.k)).toBe(true);
    const keys = s.k as { s: number[] }[];
    // first key ≈ 100 (zoom 1), last ≈ 150 (zoom 1.5)
    expect(keys[0]!.s[0]).toBeCloseTo(100, 1);
    expect(keys[keys.length - 1]!.s[0]).toBeCloseTo(150, 1);
  });

  it('the STATIC push-in round-trips (export→import→render) perceptually (SSIM ≥ 0.98)', async () => {
    const original = cameraScene(1.5);
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    const roundTripped = importLottie(doc).toSceneModule();
    const a = await renderPixels(original, 0);
    const b = await renderPixels(roundTripped, 0);
    expect(ssim(a, b, W, H)).toBeGreaterThanOrEqual(0.98);
  });

  it('the ANIMATED push-in round-trips at every sampled frame (SSIM ≥ 0.98)', async () => {
    const original = cameraScene('anim');
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    const roundTripped = importLottie(doc).toSceneModule();
    for (const frame of [0, 20, 40, 59]) {
      const t = frame / FPS;
      const a = await renderPixels(original, t);
      const b = await renderPixels(roundTripped, t);
      expect(ssim(a, b, W, H), `frame ${frame}`).toBeGreaterThanOrEqual(0.98);
    }
  });

  it('a STANDALONE shake(node) is honestly WARNED (render-only), never silently dropped', () => {
    const warnings: string[] = [];
    const mod: SceneModule = {
      createScene: () => {
        const dot = new Circle({ id: 'dot', radius: 30, position: [120, 120], fill: '#3366cc' });
        return createScene({ size: { w: W, h: H }, children: [shake(dot, { seed: 4, translate: 6 })] });
      },
      timeline: { version: 1, duration: 1, fps: FPS, tracks: [] },
    };
    exportLottie(mod, { width: W, height: H, fps: FPS, onWarn: (m) => warnings.push(m) });
    const shakeWarns = warnings.filter((w) => /shake.*render-only/i.test(w));
    expect(shakeWarns).toHaveLength(1); // exactly once, per shaken node
  });

  it('a NO-shake scene emits NO shake warn (no false positive)', () => {
    const warnings: string[] = [];
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: W, h: H }, children: [new Circle({ id: 'd', radius: 20, position: [120, 120], fill: '#3366cc' })] }),
      timeline: { version: 1, duration: 1, fps: FPS, tracks: [] },
    };
    exportLottie(mod, { width: W, height: H, fps: FPS, onWarn: (m) => warnings.push(m) });
    expect(warnings.some((w) => /shake/i.test(w))).toBe(false);
  });

  it('a whole-frame camera shake is honestly WARNED (render-only), never silently dropped', () => {
    const warnings: string[] = [];
    const mod: SceneModule = {
      createScene: () =>
        createScene({
          size: { w: W, h: H },
          children: [camera([{ content: new Circle({ id: 'd', radius: 20, position: [120, 120] }) }], { id: 'cam', shake: { seed: 1, translate: 3 } })],
        }),
      timeline: { version: 1, duration: 1, fps: FPS, tracks: [] },
    };
    exportLottie(mod, { width: W, height: H, fps: FPS, onWarn: (m) => warnings.push(m) });
    expect(warnings.some((w) => /shake.*render-only/i.test(w))).toBe(true);
  });
});

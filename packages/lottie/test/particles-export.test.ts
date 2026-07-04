/**
 * 0.57 Particles/Emitters → Lottie interchange (the 0.55 never-silent rule).
 *
 * particles() is FAITHFUL BY CONSTRUCTION: every slot is a real Circle node driven
 * by real position/opacity/scale tracks — there is NO render-only / custom-draw
 * path. So the export→importLottie→Skia round-trip must reach a HIGH SSIM uniformly
 * (no render-only warn, unlike the kinetic cursor/mask paths), and the exported
 * layer count must be PROPORTIONAL to the live particles (pruned slots emit no layer).
 */

import { describe, expect, it } from 'vitest';
import { timeline, type Timeline } from '@glissade/core';
import { Circle, Rect, createScene, evaluate, type Node, type SceneModule } from '@glissade/scene';
import { sparks, drift, particles } from '@glissade/scene/motion';
import { SkiaBackend, ssim } from '@glissade/backend-skia';
import { exportLottie } from '../src/export.js';
import { importLottie } from '../src/index.js';

const W = 240;
const H = 240;
const FPS = 30;
const DURATION = 1.5;

function sceneMod(children: Node[], tracks: Timeline['tracks']): SceneModule {
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [new Rect({ id: 'bg', width: W, height: H, position: [W / 2, H / 2], fill: '#0b0e16' }), ...children],
      }),
    timeline: timeline({ fps: FPS, duration: DURATION, tracks }),
  };
}

async function renderPixels(mod: SceneModule, t: number): Promise<Uint8ClampedArray> {
  const scene = mod.createScene();
  const backend = new SkiaBackend(W, H);
  scene.setTextMeasurer(backend);
  backend.render(evaluate(scene, mod.timeline, t));
  return backend.readPixels();
}

/** Build a scene + capture the export warnings. */
function exportWith(mod: SceneModule): { doc: ReturnType<typeof exportLottie>; warnings: string[] } {
  const warnings: string[] = [];
  const doc = exportLottie(mod, { width: W, height: H, fps: FPS, onWarn: (m) => warnings.push(m) });
  return { doc, warnings };
}

describe('particles → Lottie round-trip (Skia SSIM — faithful by construction)', () => {
  // a sparks burst + an ambient drift, the golden-particles shape at a smaller size
  const build = () => {
    const burst = sparks([0.66, 0.5], { box: { w: W, h: H }, duration: DURATION, fps: FPS, count: 20, radius: 3, seed: 41 });
    const motes = drift({ box: { w: W, h: H }, id: 'motes', origin: [0.3, 0.7], duration: DURATION, fps: FPS, count: 14, rate: 6, radius: 2.5, seed: 17 });
    return { burst, motes };
  };
  const { burst, motes } = build();
  const original = sceneMod([motes.node, burst.node], [...motes.tracks, ...burst.tracks]);

  it('re-imports with NO render-only drop/warn (baked tracks are real)', () => {
    const { warnings } = exportWith(original);
    expect(warnings.some((w) => /not exportable|render-only|not exported|dropped/i.test(w))).toBe(false);
  });

  it('exports a PROPORTIONAL layer count — one shape layer per live slot (+ bg)', () => {
    const { doc } = exportWith(original);
    const shapeLayers = doc.layers.filter((l) => l.ty === 4);
    const liveSlots = burst.node.children.length + motes.node.children.length;
    // bg + every live particle slot → each is its own ty:4 shape layer (no 200 near-empty layers)
    expect(shapeLayers.length).toBe(liveSlots + 1);
  });

  const FRAMES = [0, 6, 15, 30, 44];
  it.each(FRAMES)('frame %i matches the original perceptually (SSIM ≥ 0.98)', async (frame) => {
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    const roundTripped = importLottie(doc).toSceneModule();
    const t = frame / FPS;
    const a = await renderPixels(original, t);
    const b = await renderPixels(roundTripped, t);
    expect(ssim(a, b, W, H), `frame ${frame}`).toBeGreaterThanOrEqual(0.98);
  });
});

describe('particles → Lottie: a low-density pool prunes to proportional layers', () => {
  it('a burst of 8 into a pool of 40 exports 8 shape layers, not 40', () => {
    const r = particles({
      id: 'few',
      count: 40,
      box: { w: W, h: H },
      duration: 1,
      fps: FPS,
      burst: 8,
      origin: [0.5, 0.5],
      lifetime: [0.4, 0.8],
      velocity: { speed: [40, 120], angle: [0, 360] },
      appearance: () => new Circle({ radius: 3, fill: '#ffd27f' }),
    });
    const mod = sceneMod([r.node], r.tracks);
    const { doc } = exportWith(mod);
    const shapeLayers = doc.layers.filter((l) => l.ty === 4);
    expect(shapeLayers.length).toBe(8 + 1); // 8 live slots + bg, NOT 40
  });
});

/**
 * gs parity (Phase A) — the cross-backend perceptual reviewer. Proves: a mappable
 * scene rendered skia-vs-lottie clears the SSIM floor per frame (the export↔import
 * round-trip, measured through the CLI command); --heatmap writes a decodable PNG
 * of the render dimensions; the report shape carries the per-pair numbers; a
 * requested `dom` backend fails LOUD (never silently skipped); and the --min floor
 * gates the run (a floor of 1.0 fails a never-perfect round-trip).
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { afterAll, describe, expect, it } from 'vitest';
import { parityCommand, parseBackends, ParityBackendError } from '../src/parity.js';
import fixtureModule from './fixtures/parity-scene.js';
import imageModule from './fixtures/parity-image.js';
// Real corpus scenes, imported through vitest's graph (instanceof-safe) — the render
// environment (variable-font axes, Yoga, asset decode) is exercised end-to-end.
import vfModule from '../../examples/src/scenes/golden-font-axis-anim.js';
import layoutModule from '../../examples/src/scenes/golden-layout.js';

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));
const EXAMPLES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const MODULE = join(FIXTURES, 'parity-scene.ts');
const VF_MODULE = join(EXAMPLES, 'golden-font-axis-anim.ts');
const LAYOUT_MODULE = join(EXAMPLES, 'golden-layout.ts');
const IMAGE_MODULE = join(FIXTURES, 'parity-image.ts');
const NAME = 'parity-scene';
// Pass the module through vitest's OWN graph (not jiti) so the exporter's
// instanceof node-kind checks see the SAME @glissade/scene — see ParityOptions.module.
// The built CLI loads from modulePath via jiti (verified separately with gs export).
const MOD = { modulePath: MODULE, module: fixtureModule } as const;
const FRAMES = [0, 30, 60, 90, 119];

const tmp = mkdtempSync(join(tmpdir(), 'glissade-parity-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Decode a PNG's dimensions (byte round-trip), reusing @napi-rs/canvas like repin. */
async function pngDims(path: string): Promise<{ w: number; h: number }> {
  const img = await loadImage(path);
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  return { w: img.width, h: img.height };
}

describe('gs parity — skia vs lottie perceptual review', () => {
  it('every sampled frame clears the SSIM floor (skia reference vs lottie round-trip)', async () => {
    const r = await parityCommand({ ...MOD, name: NAME, frames: FRAMES });
    expect(r.ok).toBe(true);
    expect(r.belowFloor).toBe(0);
    expect(r.frames.length).toBe(FRAMES.length);
    for (const f of r.frames) {
      const lottie = f.pairs.find((p) => p.backend === 'lottie')!;
      expect(lottie.mean, `frame ${f.frame}`).toBeGreaterThanOrEqual(0.98);
      // the worst tile never exceeds the mean, and grid coords are present
      expect(lottie.min).toBeLessThanOrEqual(lottie.mean);
      expect(lottie.minTile).toHaveProperty('tx');
    }
  });

  it('defaults to the fixture scene size and the timeline fps', async () => {
    const r = await parityCommand({ ...MOD, name: NAME, frames: [0] });
    expect(r.width).toBe(240);
    expect(r.height).toBe(240);
    expect(r.backends).toEqual(['lottie']); // skia is the reference, not a compared leg
  });

  it('--heatmap writes a decodable PNG per frame at the render dimensions', async () => {
    const heatDir = join(tmp, 'heat');
    const r = await parityCommand({ ...MOD, name: NAME, frames: [0, 60], heatmapDir: heatDir });
    const paths = r.frames.flatMap((f) => f.pairs.map((p) => p.heatmap!));
    expect(paths.length).toBe(2);
    for (const p of paths) {
      expect(existsSync(p)).toBe(true);
      const { w, h } = await pngDims(p);
      expect(w).toBe(240);
      expect(h).toBe(240);
    }
  });

  it('the report names the reference, the pair SSIM, and PASS', async () => {
    const r = await parityCommand({ ...MOD, name: NAME, frames: [0] });
    expect(r.report).toContain('skia reference vs lottie');
    expect(r.report).toContain('f0000  lottie');
    expect(r.report).toMatch(/PASS/);
    expect(r.report).toContain('240×240');
  });

  it('--min 1.0 fails the run (a round-trip is never byte-perfect) and marks the frame', async () => {
    const r = await parityCommand({ ...MOD, name: NAME, frames: [0, 60], min: 1 });
    expect(r.ok).toBe(false);
    expect(r.belowFloor).toBeGreaterThan(0);
    expect(r.report).toMatch(/FAIL/);
    expect(r.report).toContain('BELOW FLOOR');
    // frame 60's round-trip is imperfect (< 1.0) → below a 1.0 floor and flagged.
    expect(r.frames.find((f) => f.frame === 60)!.pairs[0]!.belowFloor).toBe(true);
  });

  it('reports the worst frame/backend across the run', async () => {
    const r = await parityCommand({ ...MOD, name: NAME, frames: FRAMES });
    expect(r.worstAt).not.toBeNull();
    expect(r.worstAt!.backend).toBe('lottie');
    expect(r.worstMean).toBeLessThanOrEqual(1);
    expect(FRAMES).toContain(r.worstAt!.frame);
  });
});

describe('gs parity — render-environment fidelity (the false-PASS guard)', () => {
  // THE must-have regression: a single-weight scene can't catch this. A variable-font
  // scene's Lottie export DROPS fontAxes. Before the fix gs parity's Skia REFERENCE
  // also rendered at default weight (it never registered the face / applied axes), so
  // reference == lottie == default → a false SSIM 1.0000 / PASS on a real interchange
  // loss. Now both legs render through the SAME env as `gs render`, so the reference
  // tracks the swept weight and the drop surfaces as a below-floor FAIL.
  it('vf: a variable-font scene surfaces the dropped fontAxes (< 1.0, not a false PASS)', async () => {
    const r = await parityCommand({ modulePath: VF_MODULE, module: vfModule, frames: [0, 60, 120, 180] });
    expect(r.ok).toBe(false); // was `true` (false PASS) before the render-env fix
    expect(r.belowFloor).toBeGreaterThan(0);
    expect(r.worstMean).toBeLessThan(0.98);
    // the loss grows with the weight sweep: the heaviest frame diverges more than
    // frame 0 (where the swept weight still equals the font's default instance).
    const meanAt = (f: number): number => r.frames.find((x) => x.frame === f)!.pairs[0]!.mean;
    expect(meanAt(180)).toBeLessThan(meanAt(0));
    expect(meanAt(180)).toBeLessThan(1);
  });

  it('layout: a flexbox scene renders (Yoga initialized) instead of erroring', async () => {
    // gs parity used to THROW here (no loadYogaLayoutEngine before evaluate).
    const r = await parityCommand({ modulePath: LAYOUT_MODULE, module: layoutModule, frames: [0, 30] });
    expect(r.frames.length).toBe(2);
    for (const f of r.frames) expect(Number.isFinite(f.pairs[0]!.mean)).toBe(true);
  });

  it('media: an image scene decodes + binds the asset instead of erroring', async () => {
    // gs parity used to ERROR on any image scene (no asset decode). The reference now
    // decodes + draws the committed swatch PNG; the run completes with finite SSIM.
    const r = await parityCommand({ modulePath: IMAGE_MODULE, module: imageModule, frames: [0] });
    expect(r.frames.length).toBe(1);
    expect(Number.isFinite(r.frames[0]!.pairs[0]!.mean)).toBe(true);
  });
});

describe('gs parity — backend validation (fail loud)', () => {
  it('parseBackends defaults to skia,lottie', () => {
    expect(parseBackends(undefined)).toEqual(['skia', 'lottie']);
    expect(parseBackends('')).toEqual(['skia', 'lottie']);
    expect(parseBackends('skia,lottie')).toEqual(['skia', 'lottie']);
  });

  it('a requested dom backend fails loud with the Phase-B message', () => {
    expect(() => parseBackends('skia,dom')).toThrow(ParityBackendError);
    expect(() => parseBackends('skia,dom')).toThrow(/dom parity leg needs Playwright/);
    expect(() => parseBackends('skia,dom')).toThrow(/Phase B/);
  });

  it('an unknown backend fails loud', () => {
    expect(() => parseBackends('skia,webgpu')).toThrow(ParityBackendError);
    expect(() => parseBackends('skia,webgpu')).toThrow(/unknown parity backend 'webgpu'/);
  });

  it('a run with no non-reference backend is rejected', async () => {
    await expect(parityCommand({ ...MOD, name: NAME, frames: [0], backends: ['skia'] })).rejects.toThrow(
      ParityBackendError,
    );
  });
});

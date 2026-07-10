/**
 * 0.75 two-tier render SCALE — `gs render --preview --preview-res <f>` renders a
 * watchable DRAFT at f× the OUTPUT RASTER resolution (fewer pixels to rasterize).
 *
 * THE HARD SHAPE (0.75 design converge):
 *  - `--preview-res` REQUIRES `--preview`; without it (or with `--final`) it
 *    FAILS LOUD — a scaled render is a draft, so the certified/production master is
 *    structurally full-res and goldens can never be scaled.
 *  - `0 < f ≤ 1` else fail-loud; `f === 1` (or no flag) takes the EXACT current
 *    unscaled code path (byte-identical to pre-0.75).
 *  - CANONICAL rounding `round(w*f)` + the EFFECTIVE scale `scaledDim/origDim`
 *    (NOT the raw f), so the composition exactly FILLS the scaled canvas.
 *  - isolation: a scaled frame's renderConfig/frame-cache key is DISTINCT per
 *    factor and vs full-res → no cross-tier cross-serve.
 *  - the default no-flag render path is UNTOUCHED.
 *
 * Pure-piece unit tests (fail-loud validation, canonical dim math, cache-key
 * isolation) + minimal real single-frame renders where determinism / isolation /
 * caching must be exercised end-to-end. No ffmpeg / no multi-frame video render.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { loadImage } from '@napi-rs/canvas';
import { render, resolvePreviewRes, scaledRenderDims, PreviewResError } from '../src/render.js';
import { frameCacheKey, type CacheKeyContext } from '../src/frameCache.js';
import type { DisplayList } from '@glissade/scene';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const MODULE = join(SCENES, 'golden-shapes.ts'); // 640×360, no text → no font setup
const outDir = mkdtempSync(join(tmpdir(), 'gs-preview-res-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

// ── 1. FAIL-LOUD arg validation (pure) ──────────────────────────────────────
describe('resolvePreviewRes — the fail-loud validation (the hard shape)', () => {
  it('no --preview-res → undefined regardless of tier (the exact current path)', () => {
    expect(resolvePreviewRes(undefined, 'final')).toBeUndefined();
    expect(resolvePreviewRes(undefined, 'preview')).toBeUndefined();
  });

  it('--preview-res WITHOUT --preview (tier=final) → throws (requires --preview)', () => {
    expect(() => resolvePreviewRes(0.5, 'final')).toThrow(PreviewResError);
    expect(() => resolvePreviewRes(0.5, 'final')).toThrow(/requires --preview/);
    // the message states WHY: the master is always full-res
    expect(() => resolvePreviewRes(0.5, 'final')).toThrow(/full-res/);
  });

  it('f outside (0, 1] → throws (0 and >1 both rejected)', () => {
    expect(() => resolvePreviewRes(0, 'preview')).toThrow(PreviewResError);
    expect(() => resolvePreviewRes(-0.5, 'preview')).toThrow(/\(0, 1]/);
    expect(() => resolvePreviewRes(1.5, 'preview')).toThrow(/\(0, 1]/);
    expect(() => resolvePreviewRes(Number.NaN, 'preview')).toThrow(PreviewResError);
  });

  it('f === 1 with --preview → undefined (the EXACT current unscaled path, byte-identical)', () => {
    // f==1 must NOT route through a scale-with-s=1 branch (an identity transform can
    // shift a byte); it takes the unscaled code path exactly like no flag at all.
    expect(resolvePreviewRes(1, 'preview')).toBeUndefined();
  });

  it('0 < f < 1 with --preview → the factor to apply', () => {
    expect(resolvePreviewRes(0.5, 'preview')).toBe(0.5);
    expect(resolvePreviewRes(0.333, 'preview')).toBe(0.333);
  });
});

// ── 5. Canonical rounding + EFFECTIVE scale fills the canvas (pure) ──────────
describe('scaledRenderDims — canonical round(w*f) + EFFECTIVE scale fills exactly', () => {
  it('round() is half-up integer arithmetic (no float platform-variance)', () => {
    expect(scaledRenderDims(640, 360, 0.5)).toMatchObject({ width: 320, height: 180 });
    // 640*0.333 = 213.12 → 213 ; 360*0.333 = 119.88 → 120 (half-up rounding)
    expect(scaledRenderDims(640, 360, 0.333).width).toBe(213);
    expect(scaledRenderDims(640, 360, 0.333).height).toBe(120);
  });

  it('a non-clean factor on a NON-DIVISIBLE dim: dims = round(w*f), effective scale fills exactly', () => {
    // 641 * 0.333 = 213.453 → round → 213
    const d = scaledRenderDims(641, 641, 0.333);
    expect(d.width).toBe(213);
    expect(d.height).toBe(213);
    // the EFFECTIVE scale is scaledDim/origDim (NOT the requested 0.333) — so the
    // composition exactly FILLS the canvas: origW * scaleX === width (no gap/overflow).
    expect(d.scaleX).toBe(213 / 641);
    expect(641 * d.scaleX).toBeCloseTo(213, 10);
    expect(Math.round(641 * d.scaleX)).toBe(d.width);
    // the effective scale is NOT the raw requested factor
    expect(d.scaleX).not.toBe(0.333);
  });

  it('clamps to a minimum of 1px per axis (a sub-pixel factor still renders)', () => {
    expect(scaledRenderDims(10, 10, 0.01)).toMatchObject({ width: 1, height: 1 });
  });
});

// ── 3/4 support: frame-cache key isolation (pure) ────────────────────────────
describe('frameCacheKey — outputDims isolates a scaled frame (no cross-serve)', () => {
  const dl: DisplayList = { size: { w: 4, h: 4 }, resources: [], commands: [] };
  const base: CacheKeyContext = { version: '0.75.0', capsId: 'caps:x', assetsDigest: '' };

  it('omitting outputDims yields the pre-0.75 key (default path byte-identical)', () => {
    const withEmpty: CacheKeyContext = { ...base, outputDims: '' };
    // neither an absent nor an empty outputDims appends anything → identical to base
    expect(frameCacheKey(dl, withEmpty)).toBe(frameCacheKey(dl, base));
  });

  it('a scaled outputDims changes the key, and differs per factor', () => {
    const full = frameCacheKey(dl, base);
    const half = frameCacheKey(dl, { ...base, outputDims: '320x180' });
    const threeq = frameCacheKey(dl, { ...base, outputDims: '480x270' });
    expect(half).not.toBe(full);
    expect(threeq).not.toBe(full);
    expect(half).not.toBe(threeq);
    // same dims → same key (reproducible / cacheable)
    expect(frameCacheKey(dl, { ...base, outputDims: '320x180' })).toBe(half);
  });
});

// ── real single-frame renders (determinism / isolation / cache / fail-loud) ──
const readPngSize = async (file: string): Promise<{ w: number; h: number }> => {
  const img = await loadImage(readFileSync(file));
  return { w: img.width, h: img.height };
};

describe('render() — scaled draft end to end (single still, no ffmpeg)', () => {
  it('2. a scaled render is byte-identical ×2 at {0.5, 0.75} (within-scale determinism)', async () => {
    for (const f of [0.5, 0.75]) {
      const a = join(outDir, `det-${f}-a.png`);
      const b = join(outDir, `det-${f}-b.png`);
      await render({ modulePath: MODULE, out: a, frame: 30, tier: 'preview', previewRes: f });
      await render({ modulePath: MODULE, out: b, frame: 30, tier: 'preview', previewRes: f });
      expect(readFileSync(a).equals(readFileSync(b))).toBe(true);
    }
  });

  it('3. a scaled frame is DISTINCT (dims + bytes) per factor and vs full-res (isolation)', async () => {
    const full = join(outDir, 'iso-full.png');
    const half = join(outDir, 'iso-half.png');
    const threeq = join(outDir, 'iso-3q.png');
    await render({ modulePath: MODULE, out: full, frame: 30 }); // default full-res path
    await render({ modulePath: MODULE, out: half, frame: 30, tier: 'preview', previewRes: 0.5 });
    await render({ modulePath: MODULE, out: threeq, frame: 30, tier: 'preview', previewRes: 0.75 });

    // renderConfig dims differ → certHash differs → no cross-serve. Here the PROOF is
    // the on-disk PNG dims: round(640*f) × round(360*f).
    expect(await readPngSize(full)).toEqual({ w: 640, h: 360 });
    expect(await readPngSize(half)).toEqual({ w: 320, h: 180 });
    expect(await readPngSize(threeq)).toEqual({ w: 480, h: 270 });

    // and the bytes are all distinct
    expect(readFileSync(full).equals(readFileSync(half))).toBe(false);
    expect(readFileSync(half).equals(readFileSync(threeq))).toBe(false);
  });

  it('1. the DEFAULT no-flag render path is UNTOUCHED — f===1/preview equals no-flag bytes', async () => {
    // Both must take the EXACT current unscaled code path (resolvePreviewRes → undefined),
    // so they produce byte-identical output — proving f==1 never routes through a
    // scale-with-s=1 branch that could shift a byte.
    const noFlag = join(outDir, 'default-noflag.png');
    const f1 = join(outDir, 'default-f1.png');
    await render({ modulePath: MODULE, out: noFlag, frame: 30 });
    await render({ modulePath: MODULE, out: f1, frame: 30, tier: 'preview', previewRes: 1 });
    expect(readFileSync(noFlag).equals(readFileSync(f1))).toBe(true);
    expect(await readPngSize(noFlag)).toEqual({ w: 640, h: 360 });
  });

  it('render() rejects --preview-res without --preview / with --final (fail-loud)', async () => {
    await expect(
      render({ modulePath: MODULE, out: join(outDir, 'reject1.png'), frame: 0, previewRes: 0.5 }),
    ).rejects.toThrow(/requires --preview/);
    await expect(
      render({ modulePath: MODULE, out: join(outDir, 'reject2.png'), frame: 0, tier: 'final', previewRes: 0.5 }),
    ).rejects.toThrow(/requires --preview/);
  });

  it('4. cache hit == cold at a scaled factor (scaled render is cacheable + reproducible)', async () => {
    const dir = join(outDir, 'gscache');
    const cold = join(outDir, 'cache-cold.png');
    const warm = join(outDir, 'cache-warm.png');
    const opts = { modulePath: MODULE, frame: 30, tier: 'preview' as const, previewRes: 0.5 };
    // cold: a MISS stores the scaled RGBA (renderW×renderH) under the outputDims-salted key
    await render({ ...opts, out: cold, cache: { dir, mode: 'read-write' as const } });
    // warm: a HIT blits the stored scaled RGBA back → byte-identical to the cold render
    await render({ ...opts, out: warm, cache: { dir, mode: 'read-write' as const } });
    expect(readFileSync(warm).equals(readFileSync(cold))).toBe(true);
    // and the cached still carries the SCALED dims
    expect(await readPngSize(warm)).toEqual({ w: 320, h: 180 });
  });
});

// ── CLI arg-parse fail-loud (built dist/cli.js) ──────────────────────────────
describe.runIf(existsSync(CLI))('gs render --preview-res CLI parsing', () => {
  const run = (scene: string, ...extra: string[]) =>
    spawnSync(process.execPath, [CLI, 'render', scene, '--out', join(outDir, 'cli-noop.png'), '--frame', '0', ...extra], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  it('--preview-res with a non-numeric value → fail-loud (before any render)', () => {
    const r = run('/nonexistent/scene.ts', '--preview-res', 'abc');
    expect(r.status).not.toBe(0);
    expect(r.stderr?.toString() ?? '').toMatch(/--preview-res needs a numeric factor/);
  });

  it('--preview-res without --preview on a real scene → requires --preview', () => {
    const r = run(MODULE, '--preview-res', '0.5');
    expect(r.status).not.toBe(0);
    expect(r.stderr?.toString() ?? '').toMatch(/requires --preview/);
  });

  it('--preview-res 1.5 (out of range) with --preview → fail-loud', () => {
    const r = run(MODULE, '--preview', '--preview-res', '1.5');
    expect(r.status).not.toBe(0);
    expect(r.stderr?.toString() ?? '').toMatch(/\(0, 1]/);
  });
});

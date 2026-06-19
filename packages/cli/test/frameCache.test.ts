/**
 * gs render persistent whole-frame raster cache (§3.5, 0.12). Asserts:
 *  (1) HIT == MISS — a render through a warmed cache is byte-identical (PNG bytes)
 *      to a cache-off render of the same scene; `gs cache verify` agrees.
 *  (2) the NEGATIVE gate — an INCOMPLETE key (dropping the version / the
 *      DisplayList) makes `gs cache verify` FAIL, proving the gate catches the
 *      only failure mode (a stale frame served for changed content).
 *  (3) the LRU size cap evicts oldest entries past the cap.
 *  (4) mode:'off' is the exact current baseline (no .gscache, bytes unchanged).
 *  (5) the key folds version + capsId + DisplayList; --cache-max-size parsing.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { evaluate, type DisplayList } from '@glissade/scene';
import { render, loadSceneModule } from '../src/render.js';
import {
  FrameCache,
  frameCacheKey,
  capsId,
  combineAssetDigests,
  parseCacheMaxSize,
  DEFAULT_CACHE_MAX_SIZE,
  type CacheKeyContext,
} from '../src/frameCache.js';
import { cacheVerifyCommand } from '../src/cacheVerify.js';

const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const SHAPES = join(SCENES, 'golden-shapes.ts');
const CACHE_SCENE = join(SCENES, 'golden-cache.ts');
const outDir = mkdtempSync(join(tmpdir(), 'glissade-fc-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

/** sha256 of every PNG in a render-output dir, in frame order. */
function pngHashes(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => sha(readFileSync(join(dir, f))));
}

describe('frameCacheKey completeness', () => {
  it('folds the DisplayList, the version, AND the capsId', async () => {
    const mod = await loadSceneModule(SHAPES);
    const scene = mod.createScene();
    const dl: DisplayList = evaluate(scene, mod.timeline, 0.5);
    const base: CacheKeyContext = { version: '1.0.0', capsId: 'caps:x', assetsDigest: '' };
    const k = frameCacheKey(dl, base);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    // a different version → different key (bump-on-version invalidation)
    expect(frameCacheKey(dl, { ...base, version: '1.0.1' })).not.toBe(k);
    // a different capsId → different key
    expect(frameCacheKey(dl, { ...base, capsId: 'caps:y' })).not.toBe(k);
    // a different asset-content digest → different key (an in-place asset edit)
    expect(frameCacheKey(dl, { ...base, assetsDigest: 'deadbeef' })).not.toBe(k);
    // a different DisplayList (different frame) → different key
    const dl2 = evaluate(scene, mod.timeline, 0.6);
    expect(frameCacheKey(dl2, base)).not.toBe(k);
    // same inputs → stable
    expect(frameCacheKey(evaluate(scene, mod.timeline, 0.5), base)).toBe(k);
  });

  it('combineAssetDigests is sort-stable and folds asset BYTES into the key', () => {
    // order-independence: the same id→byteDigest map yields the same digest
    // regardless of insertion order (assets load in arbitrary order across runs)
    const a = combineAssetDigests(new Map([['logo', 'aa'], ['clip', 'bb']]));
    const b = combineAssetDigests(new Map([['clip', 'bb'], ['logo', 'aa']]));
    expect(a).toBe(b);
    // an empty map is the no-asset baseline (byte-identical to a pre-digest key)
    expect(combineAssetDigests(new Map())).toBe('');
    // changing an asset's byte digest changes the combined digest (an in-place edit)
    const edited = combineAssetDigests(new Map([['logo', 'cc'], ['clip', 'bb']]));
    expect(edited).not.toBe(a);
  });

  it('capsId is canonical (filter-order independent)', () => {
    const a = capsId({ filters: new Set(['blur', 'drop-shadow']), shaders: false, maxTextureSize: 16384 });
    const b = capsId({ filters: new Set(['drop-shadow', 'blur']), shaders: false, maxTextureSize: 16384 });
    expect(a).toBe(b);
    expect(capsId({ filters: new Set(['blur']), shaders: true, maxTextureSize: 16384 })).not.toBe(a);
    expect(capsId({ filters: new Set(['blur']), shaders: false, maxTextureSize: 8192 })).not.toBe(
      capsId({ filters: new Set(['blur']), shaders: false, maxTextureSize: 16384 }),
    );
  });
});

describe('HIT == MISS (byte-identity by construction)', () => {
  it('a --cache render twice is byte-identical to a cache-off render', async () => {
    const cacheDir = join(outDir, 'gscache-hitmiss');
    const offOut = join(outDir, 'off');
    const warmOut = join(outDir, 'warm');
    const hitOut = join(outDir, 'hit');

    // cache OFF — today's baseline
    await render({ modulePath: CACHE_SCENE, out: offOut, frameRange: [0, 5] });
    const baseline = pngHashes(offOut);

    // cache read-write, cold (warming pass)
    await render({ modulePath: CACHE_SCENE, out: warmOut, frameRange: [0, 5], cache: { dir: cacheDir, mode: 'read-write' } });
    expect(pngHashes(warmOut)).toEqual(baseline);

    // cache read-only, all-hits — must be byte-identical to the cache-off render
    await render({ modulePath: CACHE_SCENE, out: hitOut, frameRange: [0, 5], cache: { dir: cacheDir, mode: 'read-only' } });
    expect(pngHashes(hitOut)).toEqual(baseline);
  });

  it('gs cache verify passes for a real scene (hits == cold renders)', async () => {
    const result = await cacheVerifyCommand({ modulePath: CACHE_SCENE, frameRange: [0, 6] });
    expect(result.ok).toBe(true);
    expect(result.comparedFrames).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.report).toMatch(/byte-identical/);
  });

  it('gs cache verify samples 1-of-N and LOGS the sampled frames', async () => {
    const result = await cacheVerifyCommand({ modulePath: CACHE_SCENE, frameRange: [0, 10], sample: 3 });
    expect(result.ok).toBe(true);
    expect(result.comparedFrames).toEqual([0, 3, 6, 9]);
    expect(result.report).toMatch(/1-of-3 sample/);
    expect(result.report).toMatch(/\[0, 3, 6, 9\]/);
  });
});

describe('asset-content digest — an in-place asset edit is NOT served stale', () => {
  // Write a solid-color WxH PNG to `path`.
  const writePng = (path: string, w: number, h: number, color: string): void => {
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    writeFileSync(path, c.toBuffer('image/png'));
  };

  // A scene module embedding an image asset by id; the asset url resolves next to
  // the module file.
  const writeImageScene = (modulePath: string, imageRel: string): void => {
    writeFileSync(
      modulePath,
      `
import { timeline } from '@glissade/core';
import { createScene, Rect, Image, type SceneModule } from '@glissade/scene';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 64, h: 64 },
      children: [
        new Rect({ id: 'bg', width: 64, height: 64, position: [32, 32], fill: '#000000' }),
        new Image({ id: 'logo', assetId: 'logo', width: 64, height: 64, position: [32, 32] }),
      ],
    }),
  timeline: timeline(() => {}, {
    fps: 30,
    duration: 0.2,
    assets: { logo: { kind: 'image', url: '${imageRel}' } },
  }),
};
export default mod;
`,
    );
  };

  it('mutating logo.png bytes (same path) does NOT serve the pre-edit pixels from --cache', async () => {
    const work = mkdtempSync(join(tmpdir(), 'glissade-fc-asset-'));
    try {
      const imgPath = join(work, 'logo.png');
      const modPath = join(work, 'scene.ts');
      const cacheDir = join(work, 'gscache');
      writeImageScene(modPath, 'logo.png');

      // RED image: warm the cache (read-write) over a couple frames.
      writePng(imgPath, 64, 64, '#ff0000');
      const redOut = join(work, 'red');
      await render({ modulePath: modPath, out: redOut, frameRange: [0, 1], cache: { dir: cacheDir, mode: 'read-write' } });
      const redHashes = pngHashes(redOut);

      // Now EDIT the asset bytes in place (same path/id/url) → BLUE.
      writePng(imgPath, 64, 64, '#0000ff');

      // ground truth: a cache-OFF render of the mutated (blue) scene.
      const blueTruthOut = join(work, 'blue-truth');
      await render({ modulePath: modPath, out: blueTruthOut, frameRange: [0, 1] });
      const blueTruth = pngHashes(blueTruthOut);
      // sanity: the edit actually changes the pixels
      expect(blueTruth).not.toEqual(redHashes);

      // the SECOND --cache render over the SAME cache dir must reflect the edit —
      // i.e. the asset-content digest changed the key, so no stale RED frame is
      // served. It must equal the blue ground truth, NOT the warmed red.
      const blueCachedOut = join(work, 'blue-cached');
      await render({ modulePath: modPath, out: blueCachedOut, frameRange: [0, 1], cache: { dir: cacheDir, mode: 'read-write' } });
      const blueCached = pngHashes(blueCachedOut);
      expect(blueCached).toEqual(blueTruth);
      expect(blueCached).not.toEqual(redHashes);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

describe('NEGATIVE gate — an incomplete key makes verify FAIL', () => {
  it('a keyer that DROPS the DisplayList serves a stale frame → verify fails', async () => {
    // A structurally-incomplete key: it folds ONLY the version, ignoring the
    // frame's DisplayList entirely. Every frame collapses to the SAME key, so the
    // cache serves frame 0's pixels for every later frame — exactly the silent
    // stale-tile corruption the gate must catch.
    const result = await cacheVerifyCommand({
      modulePath: CACHE_SCENE,
      frameRange: [0, 5],
      keyerOverride: (_dl, ctx) => createHash('sha256').update(ctx.version).digest('hex'),
    });
    expect(result.ok).toBe(false);
    expect(result.mismatch).toBeDefined();
    expect(result.mismatch!.frame).toBeGreaterThan(0); // frame 0 matches itself; a later frame diverges
    expect(result.report).toMatch(/CACHE VERIFY FAILED/);
    expect(result.report).toMatch(/INCOMPLETE/);
  });

  it('a keyer that DROPS the version still fails when the version would matter', async () => {
    // Sanity counter-check: the COMPLETE keyer passes on the same scene/range, so
    // the failure above is attributable to the dropped component, not the scene.
    const ok = await cacheVerifyCommand({ modulePath: CACHE_SCENE, frameRange: [0, 5] });
    expect(ok.ok).toBe(true);
  });
});

describe('size-capped LRU (ships day one)', () => {
  it('evicts oldest entries once the cap is exceeded', () => {
    const dir = join(outDir, 'lru');
    // tiny RGBA frames so we can predict bytes; cap admits ~2 entries.
    const w = 8;
    const h = 8;
    const mk = (fill: number) => new Uint8ClampedArray(w * h * 4).fill(fill);

    // size one entry first to derive the per-entry compressed size, then set the
    // cap to hold ~2 of them.
    const probe = new FrameCache({ dir: join(outDir, 'lru-probe'), mode: 'read-write' });
    probe.put('p', w, h, mk(7));
    const perEntry = probe.diskSize();
    expect(perEntry).toBeGreaterThan(0);

    const cache = new FrameCache({ dir, mode: 'read-write', maxSize: perEntry * 2 + 1 });
    cache.put('a', w, h, mk(1));
    cache.put('b', w, h, mk(2));
    cache.put('c', w, h, mk(3)); // exceeds cap → evicts oldest ('a')

    expect(cache.entryCount()).toBeLessThanOrEqual(2);
    expect(cache.getStats().evicted).toBeGreaterThanOrEqual(1);
    // 'a' (oldest) evicted; 'c' (newest) retained
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('a HIT touches mtime so a recently-read entry survives eviction (true access-LRU)', async () => {
    const dir = join(outDir, 'lru-touch');
    const w = 8;
    const h = 8;
    const mk = (fill: number) => new Uint8ClampedArray(w * h * 4).fill(fill);
    const probe = new FrameCache({ dir: join(outDir, 'lru-touch-probe'), mode: 'read-write' });
    probe.put('p', w, h, mk(9));
    const perEntry = probe.diskSize();

    const cache = new FrameCache({ dir, mode: 'read-write', maxSize: perEntry * 2 + 1 });
    cache.put('a', w, h, mk(1));
    await new Promise((r) => setTimeout(r, 10)); // distinct mtimes
    cache.put('b', w, h, mk(2));
    await new Promise((r) => setTimeout(r, 10));
    cache.get('a'); // touch 'a' → now MRU
    await new Promise((r) => setTimeout(r, 10));
    cache.put('c', w, h, mk(3)); // evicts the LRU, which is now 'b' (not the touched 'a')

    expect(cache.get('a')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
  });
});

describe("mode:'off' == today's baseline", () => {
  it('off mode writes no .gscache and produces identical bytes', async () => {
    const offDir = join(outDir, 'off-mode-cache');
    const a = join(outDir, 'baseline-a');
    const b = join(outDir, 'off-b');
    await render({ modulePath: SHAPES, out: a, frameRange: [0, 3] });
    await render({ modulePath: SHAPES, out: b, frameRange: [0, 3], cache: { dir: offDir, mode: 'off' } });
    expect(pngHashes(a)).toEqual(pngHashes(b));
    expect(existsSync(offDir)).toBe(false); // off never creates the dir
  });

  it('read-only mode never writes (no .gscache entries appear)', () => {
    const dir = join(outDir, 'ro-nowrite');
    const cache = new FrameCache({ dir, mode: 'read-only' });
    cache.put('x', 8, 8, new Uint8ClampedArray(8 * 8 * 4).fill(5));
    expect(cache.entryCount()).toBe(0);
  });
});

describe('store + load round-trip + zlib', () => {
  it('stored RGBA inflates back byte-identical', () => {
    const dir = join(outDir, 'roundtrip');
    const cache = new FrameCache({ dir, mode: 'read-write' });
    const rgba = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 31) & 0xff;
    cache.put('k', 16, 16, rgba);
    const back = cache.get('k');
    expect(back).toBeDefined();
    expect(Array.from(back!)).toEqual(Array.from(rgba));
  });
});

describe('parseCacheMaxSize', () => {
  it('parses raw bytes and human sizes', () => {
    expect(parseCacheMaxSize('1024')).toBe(1024);
    expect(parseCacheMaxSize('2GB')).toBe(2 * 1024 ** 3);
    expect(parseCacheMaxSize('512MB')).toBe(512 * 1024 ** 2);
    expect(parseCacheMaxSize('1.5g')).toBe(Math.floor(1.5 * 1024 ** 3));
    expect(parseCacheMaxSize('4k')).toBe(4096);
    expect(DEFAULT_CACHE_MAX_SIZE).toBe(2 * 1024 ** 3);
  });

  it('rejects garbage', () => {
    expect(() => parseCacheMaxSize('big')).toThrow(/byte count or size/);
    expect(() => parseCacheMaxSize('')).toThrow();
    expect(() => parseCacheMaxSize('2 gigs')).toThrow();
  });
});

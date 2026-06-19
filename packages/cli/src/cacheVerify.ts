/**
 * gs cache verify — THE verify gate for the persistent `.gscache` (DESIGN.md §3.5,
 * 0.12). The frame cache's single failure mode is SILENT corruption (a stale tile
 * served from an incomplete key), so this gate is MANDATORY: it renders the scene
 * through the cache (read-only — serving HITS) and again with the cache OFF, then
 * asserts the per-frame `encodePng` bytes are EQUAL frame-for-frame. A mismatch
 * means a hit is NOT byte-identical to a cold render — the cache is unsafe.
 *
 * This EXTENDS verify-determinism's committed-byte-hash machinery (`sha256` over
 * the rasterized frame bytes — the same `node:crypto` precedent) across the DISK
 * boundary: instead of linear-vs-shard, it is cache-hit-vs-cache-off.
 *
 * A sampled fraction is fine for speed, and the sample is LOGGED (no silent caps):
 * the report names exactly which frames were compared.
 *
 * Companion NEGATIVE gate: see `cacheVerify.test.ts`, which injects a deliberately
 * INCOMPLETE key (drops the version / a transform-bearing component) and asserts
 * this comparison FAILS — proving the gate actually catches the only failure mode.
 */

import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluate, withDeterminismGuards, type DisplayList, type SceneModule } from '@glissade/scene';
import { SkiaBackend } from '@glissade/backend-skia';
import { loadSceneModule } from './render.js';
import {
  FrameCache,
  capsId,
  frameCacheKey,
  type CacheKeyContext,
} from './frameCache.js';
import { glissadeVersion } from './version.js';

/** sha256 hex of the encoded PNG bytes — the authoritative cross-the-disk-boundary check. */
function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export interface CacheVerifyOptions {
  modulePath: string;
  /** inclusive frame range [first, last]; default the whole timeline. */
  frameRange?: [number, number];
  /** fps override (default: timeline fps, else 60). */
  fps?: number;
  /** sample 1-of-N frames for the byte compare (default 1 = every frame). LOGGED. */
  sample?: number;
  /**
   * INTERNAL test seam: override the cache-key context. The NEGATIVE gate passes a
   * deliberately INCOMPLETE keyer to prove the verify FAILS when the key drops a
   * byte-affecting component. Never set by the CLI.
   */
  keyContextOverride?: CacheKeyContext;
  /**
   * INTERNAL test seam: a custom keyer (e.g. one that IGNORES the DisplayList) to
   * simulate a structurally-incomplete key for the NEGATIVE gate.
   */
  keyerOverride?: (dl: DisplayList, ctx: CacheKeyContext) => string;
}

export interface CacheVerifyResult {
  ok: boolean;
  /** frames actually byte-compared (the sampled set). */
  comparedFrames: number[];
  /** total frames in range (compared ⊆ this). */
  totalFrames: number;
  /** the first mismatching frame, when !ok. */
  mismatch?: { frame: number; cached: string; cold: string };
  report: string;
}

/**
 * Render one frame with a given backend, returning its encodePng bytes. When
 * `cache` is provided, a HIT loads stored RGBA via `putPixels` and encodes through
 * the IDENTICAL path; a MISS renders, encodes, and (in read-write) stores. The
 * keyer/ctx are injectable for the NEGATIVE gate.
 */
async function renderFrameBytes(
  backend: SkiaBackend,
  scene: ReturnType<SceneModule['createScene']>,
  doc: SceneModule['timeline'],
  f: number,
  fps: number,
  cache: FrameCache | undefined,
  ctx: CacheKeyContext,
  keyer: (dl: DisplayList, ctx: CacheKeyContext) => string,
): Promise<Uint8Array> {
  const dl = withDeterminismGuards('throw', () => evaluate(scene, doc, f / fps));
  if (cache && cache.mode !== 'off') {
    const key = keyer(dl, ctx);
    const hit = cache.get(key);
    if (hit) {
      backend.putPixels(hit);
      return backend.encodePng();
    }
    backend.render(dl);
    const png = backend.encodePng();
    // store the raw RGBA (await so the write completes before any later read pass)
    cache.put(key, scene.size.w, scene.size.h, await backend.readPixels());
    return png;
  }
  backend.render(dl);
  return backend.encodePng();
}

/**
 * The verify gate. Renders the range through a read-WRITE cache once (to WARM it),
 * then compares — for each SAMPLED frame — a read-ONLY render (serving the warmed
 * hits) against a cache-OFF render, by encodePng sha256. Equal frame-for-frame is
 * the contract; the first mismatch fails the gate.
 */
export async function cacheVerifyCommand(opts: CacheVerifyOptions): Promise<CacheVerifyResult> {
  const mod = await loadSceneModule(opts.modulePath);
  const scene = mod.createScene();
  const doc = mod.timeline;
  const fps = opts.fps ?? doc.fps ?? 60;
  const backend = new SkiaBackend(scene.size.w, scene.size.h);
  scene.setTextMeasurer(backend);

  const { compileTimeline } = await import('@glissade/core');
  const duration = compileTimeline(doc).duration;
  const [first, last] = opts.frameRange ?? [0, Math.max(0, Math.ceil(duration * fps) - 1)];
  const totalFrames = last - first + 1;
  const sample = Math.max(1, Math.floor(opts.sample ?? 1));

  const ctx: CacheKeyContext = opts.keyContextOverride ?? {
    version: glissadeVersion(),
    capsId: capsId(backend.caps),
  };
  const keyer = opts.keyerOverride ?? frameCacheKey;

  const dir = mkdtempSync(join(tmpdir(), 'gscache-verify-'));
  try {
    // 1) WARM: render the whole range read-write to populate the cache.
    const warm = new FrameCache({ dir, mode: 'read-write' });
    for (let f = first; f <= last; f++) {
      await renderFrameBytes(backend, scene, doc, f, fps, warm, ctx, keyer);
    }

    // 2) COMPARE the sampled frames: read-only (hits) vs cache-off.
    const readOnly = new FrameCache({ dir, mode: 'read-only' });
    const comparedFrames: number[] = [];
    let mismatch: CacheVerifyResult['mismatch'];
    for (let f = first; f <= last; f += sample) {
      comparedFrames.push(f);
      const cachedBytes = await renderFrameBytes(backend, scene, doc, f, fps, readOnly, ctx, keyer);
      const coldBytes = await renderFrameBytes(backend, scene, doc, f, fps, undefined, ctx, keyer);
      const a = sha256(cachedBytes);
      const b = sha256(coldBytes);
      if (a !== b) {
        mismatch = { frame: f, cached: a, cold: b };
        break;
      }
    }
    backend.dispose();

    const sampledNote =
      sample === 1
        ? `all ${totalFrames} frames`
        : `${comparedFrames.length} of ${totalFrames} frames (1-of-${sample} sample): [${comparedFrames.join(', ')}]`;

    if (mismatch) {
      return {
        ok: false,
        comparedFrames,
        totalFrames,
        mismatch,
        report:
          `CACHE VERIFY FAILED — a hit is NOT byte-identical to a cold render.\n` +
          `  frame ${mismatch.frame}: cached-hit PNG sha256 ${mismatch.cached.slice(0, 16)}… != cache-off ${mismatch.cold.slice(0, 16)}…\n` +
          `  the cache key is INCOMPLETE (it served a stale frame for changed content) — DO NOT SHIP.\n` +
          `  sampled: ${sampledNote}`,
      };
    }
    return {
      ok: true,
      comparedFrames,
      totalFrames,
      report:
        `cache verify OK: cache hits are byte-identical to cold renders.\n` +
        `  compared (encodePng sha256, hit vs cache-off): ${sampledNote}`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

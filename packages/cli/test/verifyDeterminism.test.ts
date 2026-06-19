/**
 * gs verify-determinism (§5.5/§5.6 §7): the cross-shard/backend byte-divergence
 * locator. Asserts (1) a pure scene's linear render is byte-identical to an
 * N-shard render; (2) a planted cross-frame-state impurity diverges and --bisect
 * localizes it to the right (frame, node, op); (3) a cross-backend byte-compare is
 * REJECTED (browser↔Skia is perceptual, never byte-identity).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildManifest,
  parseManifest,
  serializeManifest,
  verifyDeterminismCommand,
  VerifyDeterminismError,
  MANIFEST_VERSION,
} from '../src/verifyDeterminism.js';
import { loadSceneModule } from '../src/render.js';

const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const SHAPES = join(SCENES, 'golden-shapes.ts');
const DRIFT = fileURLToPath(new URL('./fixtures/nondeterministic-counter.ts', import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), 'glissade-verify-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('manifest schema', () => {
  it('builds a frames manifest with per-frame RGBA sha256 + per-node sub-hashes', async () => {
    const mod = await loadSceneModule(SHAPES);
    const m = await buildManifest(mod, 0, 3, 60);
    expect(m.manifestVersion).toBe(MANIFEST_VERSION);
    expect(m.backend).toBe('skia');
    expect(m.frames).toHaveLength(4);
    for (const f of m.frames) {
      expect(f.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.keys(f.nodes).length).toBeGreaterThan(0);
      for (const h of Object.values(f.nodes)) expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('round-trips through serialize/parse and rejects a wrong version', async () => {
    const mod = await loadSceneModule(SHAPES);
    const m = await buildManifest(mod, 0, 1, 60);
    expect(parseManifest(serializeManifest(m)).frames).toHaveLength(2);
    expect(() => parseManifest(JSON.stringify({ ...m, manifestVersion: 99 }))).toThrow(/manifestVersion/);
  });
});

describe('--shards: a pure scene is byte-identical across shards', () => {
  it('a 4-shard render of golden-shapes matches the linear render byte-for-byte', async () => {
    const result = await verifyDeterminismCommand({ modulePath: SHAPES, shards: 4, frameRange: [0, 23], fps: 60 });
    expect(result.ok).toBe(true);
    expect(result.frames).toBe(24);
    expect(result.report).toContain('byte-identical');
  });
});

describe('planted divergence: cross-frame state localizes to (frame, node, op)', () => {
  it('a non-deterministic counter scene diverges across shards and --bisect names the node/op', async () => {
    const result = await verifyDeterminismCommand({ modulePath: DRIFT, shards: 4, frameRange: [0, 3], bisect: true });
    expect(result.ok).toBe(false);
    expect(result.divergence).toBeDefined();
    // localizes to the impure node 'drift', NOT the pure 'anchor'
    expect(result.divergence!.node).toBe('drift');
    // --bisect drills the command-level diff — a transform (position) field change
    expect(result.divergence!.bisect).toBeDefined();
    expect(result.divergence!.bisect).toMatch(/transform|\bm\b/);
    expect(result.report).toContain('drift');
  });
});

describe('cross-backend byte-compare is rejected (§5.5 item 6)', () => {
  it('--against a non-skia manifest throws a clear category error', async () => {
    // a committed manifest tagged with a foreign backend (browser canvas2d)
    const mod = await loadSceneModule(SHAPES);
    const skia = await buildManifest(mod, 0, 1, 60);
    const foreign = { ...skia, backend: 'canvas2d' };
    const path = join(outDir, 'foreign.manifest');
    writeFileSync(path, JSON.stringify(foreign));
    await expect(
      verifyDeterminismCommand({ modulePath: SHAPES, against: path, frameRange: [0, 1], fps: 60 }),
    ).rejects.toThrow(VerifyDeterminismError);
    await expect(
      verifyDeterminismCommand({ modulePath: SHAPES, against: path, frameRange: [0, 1], fps: 60 }),
    ).rejects.toThrow(/cross-backend|perceptual|SSIM/);
  });
});

describe('--against a committed skia manifest', () => {
  it('a scene matches its own committed manifest (determinism contract)', async () => {
    const mod = await loadSceneModule(SHAPES);
    const m = await buildManifest(mod, 0, 5, 60);
    const path = join(outDir, 'shapes.manifest');
    writeFileSync(path, serializeManifest(m));
    const result = await verifyDeterminismCommand({ modulePath: SHAPES, against: path, frameRange: [0, 5], fps: 60 });
    expect(result.ok).toBe(true);
    expect(result.report).toContain('byte-identical');
  });
});

describe('--emit writes a baseline manifest', () => {
  it('emits a manifest that re-parses', async () => {
    const path = join(outDir, 'emitted.manifest');
    const result = await verifyDeterminismCommand({ modulePath: SHAPES, emit: path, frameRange: [0, 2], fps: 60 });
    expect(result.ok).toBe(true);
    const { readFileSync } = await import('node:fs');
    expect(parseManifest(readFileSync(path, 'utf8')).frames).toHaveLength(3);
  });
});

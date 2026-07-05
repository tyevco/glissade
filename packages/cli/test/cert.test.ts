/**
 * 0.62 gs render --certify — the TWO-SIDED CERT GATE (dims a–e) + the local
 * content-addressed render cache, on REAL Skia renders (the determinism carry).
 *
 *   (a) cert-stability   — same inputs → same certHash + byteHash run-to-run;
 *                          frame PNG bytes byte-identical.
 *   (b) sensitive-IFF    — perturb each IN determinant → certHash MOVES;
 *                          perturb an OUT field (cwd/machine/shard/wall-clock) → HOLDS.
 *   (c) verify round-trip— --certify then verifyCert → byteHash matches; a TAMPERED
 *                          cert is caught.
 *   (d) diff.empty ⟹ byte-identical (the cache-collision-safety half here on Skia:
 *                          a construction-shuffle renders byte-identically).
 *   (e) video ⊥ audio    — an audio-determinant change → video-cert HOLDS; a
 *                          narration-timing change → video-cert MOVES.
 *   cache                — a HIT serves byte-identical-to-render bytes; a MISS
 *                          renders + stores.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { render, verifyCert } from '../src/render.js';
import {
  CERT_VERSION,
  CertCache,
  CertVersionError,
  assertCertVersion,
  byteHashOf,
  computeCertHash,
  frameKeyFor,
  type VideoCertBase,
} from '../src/cert.js';

const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const MODULE = join(SCENES, 'golden-shapes.ts');
const outDir = mkdtempSync(join(tmpdir(), 'glissade-cert-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

// A small frame range keeps the Skia render fast while still exercising per-frame certs.
const RANGE: [number, number] = [0, 3];

function readManifest(out: string) {
  return JSON.parse(readFileSync(`${out}.cert.json`, 'utf8')) as import('../src/cert.js').VideoCertManifest;
}

describe('cert schema — fail-loud on unknown version', () => {
  it('assertCertVersion throws CertVersionError on an unknown schema', () => {
    expect(() => assertCertVersion(2)).toThrow(CertVersionError);
    expect(() => assertCertVersion(CERT_VERSION)).not.toThrow();
  });
});

describe('(a) cert-stability — same inputs → same certHash + byteHash', () => {
  it('two --certify renders produce identical base/certHash/byteHash + byte-identical PNGs', async () => {
    const o1 = join(outDir, 'a1');
    const o2 = join(outDir, 'a2');
    await render({ modulePath: MODULE, out: o1, frameRange: RANGE, certify: true });
    await render({ modulePath: MODULE, out: o2, frameRange: RANGE, certify: true });
    const m1 = readManifest(o1);
    const m2 = readManifest(o2);
    expect(JSON.stringify(m1.base)).toBe(JSON.stringify(m2.base));
    expect(m1.frames.map((f) => f.certHash)).toEqual(m2.frames.map((f) => f.certHash));
    expect(m1.frames.map((f) => f.byteHash)).toEqual(m2.frames.map((f) => f.byteHash));
    for (const rec of m1.frames) {
      const p1 = readFileSync(join(o1, `frame-${String(rec.i).padStart(5, '0')}.png`));
      const p2 = readFileSync(join(o2, `frame-${String(rec.i).padStart(5, '0')}.png`));
      expect(Buffer.compare(p1, p2)).toBe(0);
      // the certified byteHash IS the emitted PNG's hash (the carry).
      expect(byteHashOf(p1)).toBe(rec.byteHash);
    }
  });
});

describe('(b) sensitive-IFF — certHash moves on an IN determinant, holds on an OUT field', () => {
  const base: VideoCertBase = {
    certVersion: CERT_VERSION,
    sceneHash: 'S',
    timelineHash: 'T',
    narrationTimingHash: '',
    fontDigest: 'F',
    captionBurnMode: 'burn',
    toolchainHash: 'TC',
    backendHash: 'B',
    renderConfig: { width: 100, height: 50, pixelFormat: 'rgba8-straight', imageSmoothing: true },
  };
  const H = (b: VideoCertBase, i = 0, fps = 60) => computeCertHash(b, frameKeyFor(i, fps));

  it('IN: perturbing EACH determinant MOVES certHash', () => {
    const ref = H(base);
    expect(H({ ...base, sceneHash: 'S2' })).not.toBe(ref);
    expect(H({ ...base, timelineHash: 'T2' })).not.toBe(ref);
    expect(H({ ...base, narrationTimingHash: 'N2' })).not.toBe(ref);
    expect(H({ ...base, fontDigest: 'F2' })).not.toBe(ref);
    expect(H({ ...base, captionBurnMode: 'off' })).not.toBe(ref);
    expect(H({ ...base, toolchainHash: 'TC2' })).not.toBe(ref);
    expect(H({ ...base, backendHash: 'B2' })).not.toBe(ref);
    expect(H({ ...base, renderConfig: { ...base.renderConfig, width: 101 } })).not.toBe(ref);
    expect(H({ ...base, renderConfig: { ...base.renderConfig, imageSmoothing: false } })).not.toBe(ref);
    // frameKey (frame index) is IN → a different frame is a different cert
    expect(H(base, 1)).not.toBe(ref);
    expect(H(base, 0, 30)).not.toBe(ref);
  });

  it('OUT: cwd / machine / shard-index / wall-clock are NOT inputs → certHash HOLDS', () => {
    const ref = H(base);
    const realCwd = process.cwd();
    try {
      process.chdir(tmpdir()); // simulate a different machine/cwd
      expect(H(base)).toBe(ref); // certHash is a pure fn of the determinant set, not cwd
    } finally {
      process.chdir(realCwd);
    }
    // field-ORDER independence (canonical-sorted): a reordered base object hashes equal
    const reordered: VideoCertBase = {
      renderConfig: base.renderConfig,
      backendHash: base.backendHash,
      toolchainHash: base.toolchainHash,
      captionBurnMode: base.captionBurnMode,
      fontDigest: base.fontDigest,
      narrationTimingHash: base.narrationTimingHash,
      timelineHash: base.timelineHash,
      sceneHash: base.sceneHash,
      certVersion: base.certVersion,
    };
    expect(H(reordered)).toBe(ref);
  });
});

describe('(c) verify round-trip — the carry keyed by cert', () => {
  it('--certify then verifyCert matches every frame; a TAMPERED byteHash is caught', async () => {
    const out = join(outDir, 'c1');
    await render({ modulePath: MODULE, out, frameRange: RANGE, certify: true });
    const certPath = `${out}.cert.json`;
    const ok = await verifyCert({ modulePath: MODULE, certPath });
    expect(ok.mismatches).toHaveLength(0);
    expect(ok.ok).toBe(ok.checked);
    expect(ok.baseMatches).toBe(true);

    // tamper one frame's byteHash → verify must FLAG it (a determinism-break alarm)
    const m = readManifest(out);
    m.frames[0]!.byteHash = 'deadbeef'.repeat(8);
    writeFileSync(certPath, JSON.stringify(m));
    const bad = await verifyCert({ modulePath: MODULE, certPath });
    expect(bad.mismatches.length).toBeGreaterThan(0);
    expect(bad.mismatches[0]!.i).toBe(m.frames[0]!.i);
  });

  it('--verify-cache samples a subset', async () => {
    const out = join(outDir, 'c2');
    await render({ modulePath: MODULE, out, frameRange: RANGE, certify: true });
    const res = await verifyCert({ modulePath: MODULE, certPath: `${out}.cert.json`, sample: 2 });
    expect(res.checked).toBe(2);
    expect(res.mismatches).toHaveLength(0);
  });
});

describe('(e) video ⊥ audio — the per-stream split', () => {
  it('the video-cert base has NO audio determinant (structural invariant)', async () => {
    const out = join(outDir, 'e1');
    await render({ modulePath: MODULE, out, frameRange: RANGE, certify: true });
    const m = readManifest(out);
    const keys = Object.keys(m.base);
    for (const forbidden of ['narrationAudioHash', 'musicHash', 'sfxHash', 'loudness', 'audio']) {
      expect(keys).not.toContain(forbidden);
    }
    // a SEPARATE audio-cert exists (the per-stream artifact key)
    expect(existsSync(`${out}.audio-cert.json`)).toBe(true);
    const audio = JSON.parse(readFileSync(`${out}.audio-cert.json`, 'utf8'));
    expect(audio.kind).toBe('audio');
  });

  it('narrationTimingHash (IN) moves the video cert; an audio-only field does NOT appear in it', async () => {
    // narration-timing is a VIDEO determinant (beats re-anchor → frames shift), so
    // it lives in the video base and a change MOVES the video certHash.
    const withN: VideoCertBase = {
      certVersion: CERT_VERSION,
      sceneHash: 'S', timelineHash: 'T', narrationTimingHash: 'n1', fontDigest: 'F',
      captionBurnMode: 'burn', toolchainHash: 'TC', backendHash: 'B',
      renderConfig: { width: 100, height: 50, pixelFormat: 'rgba8-straight', imageSmoothing: true },
    };
    const reNarrated = { ...withN, narrationTimingHash: 'n2' };
    expect(computeCertHash(withN, '0@60')).not.toBe(computeCertHash(reNarrated, '0@60'));
    // an audio-only re-master (music/sfx/loudness/voice bytes) is NOT a field of the
    // video base at all — so it cannot move the video certHash by construction.
  });
});

describe('cache — HIT serves byte-identical-to-render bytes; MISS renders + stores', () => {
  it('a read-only cert cache HIT reproduces the exact render bytes', async () => {
    const cold = join(outDir, 'cache-cold');
    const cacheDir = join(outDir, 'cc');
    // cold render populates the cache (MISS × N, stored × N)
    await render({
      modulePath: MODULE, out: cold, frameRange: RANGE, certify: true,
      certCache: { dir: cacheDir, mode: 'read-write' },
    });
    // warm render served ENTIRELY from the cache (read-only): no render, byte-identical
    const warm = join(outDir, 'cache-warm');
    await render({
      modulePath: MODULE, out: warm, frameRange: RANGE,
      certCache: { dir: cacheDir, mode: 'read-only' },
    });
    for (let i = RANGE[0]; i <= RANGE[1]; i++) {
      const f = `frame-${String(i).padStart(5, '0')}.png`;
      expect(Buffer.compare(readFileSync(join(cold, f)), readFileSync(join(warm, f)))).toBe(0);
    }
  });

  it('CertCache get/put round-trips bytes + byteHash; read-only never writes', () => {
    const dir = join(outDir, 'unit-cc');
    const rw = new CertCache({ dir, mode: 'read-write' });
    const bytes = Buffer.from('some png bytes here');
    const h = 'a'.repeat(64);
    expect(rw.get(h)).toBeUndefined(); // MISS
    rw.put(h, bytes);
    const hit = rw.get(h);
    expect(hit).toBeDefined();
    expect(Buffer.compare(hit!.bytes, bytes)).toBe(0);
    expect(hit!.byteHash).toBe(byteHashOf(bytes));

    const ro = new CertCache({ dir: join(outDir, 'unit-cc-ro'), mode: 'read-only' });
    ro.put('b'.repeat(64), bytes);
    expect(ro.entryCount()).toBe(0); // read-only is a no-op write
  });
});

describe('(d) diff.empty ⟹ byte-identical — construction-shuffle renders identically on Skia', () => {
  it('two child-order permutations of one scene emit byte-identical PNGs + identical certs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'glissade-cert-shuffle-'));
    const mkMod = (order: 'ab' | 'ba') => `
      import { createScene, Rect } from '@glissade/scene';
      import { timeline } from '@glissade/core';
      const a = new Rect({ id: 'a', position: [20, 20], width: 30, height: 30, fill: '#f00' });
      const b = new Rect({ id: 'b', position: [60, 60], width: 30, height: 30, fill: '#00f' });
      export default {
        createScene: () => createScene({ size: { w: 120, h: 120 }, children: ${order === 'ab' ? '[a, b]' : '[b, a]'} }),
        timeline: timeline({ tracks: [] }),
      };`;
    const modAB = join(dir, 'ab.ts');
    const modBA = join(dir, 'ba.ts');
    writeFileSync(modAB, mkMod('ab'));
    writeFileSync(modBA, mkMod('ba'));
    const outAB = join(dir, 'ab');
    const outBA = join(dir, 'ba');
    await render({ modulePath: modAB, out: outAB, frame: 0, format: 'png-seq', certify: true });
    await render({ modulePath: modBA, out: outBA, frame: 0, format: 'png-seq', certify: true });
    const pAB = readFileSync(join(outAB, 'frame-00000.png'));
    const pBA = readFileSync(join(outBA, 'frame-00000.png'));
    expect(Buffer.compare(pAB, pBA)).toBe(0); // diff.empty ⟹ byte-identical
    // …and their sceneHash/certHash agree (the shuffle is a no-op to the cert)
    const mAB = JSON.parse(readFileSync(`${outAB}.cert.json`, 'utf8'));
    const mBA = JSON.parse(readFileSync(`${outBA}.cert.json`, 'utf8'));
    expect(mAB.base.sceneHash).toBe(mBA.base.sceneHash);
    expect(mAB.frames[0].certHash).toBe(mBA.frames[0].certHash);
    rmSync(dir, { recursive: true, force: true });
  });
});

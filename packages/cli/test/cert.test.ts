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
  buildVideoCertBase,
  byteHashOf,
  computeCertHash,
  fontComplete,
  frameKeyFor,
  type VideoCertBase,
  type VideoCertBaseInputs,
} from '../src/cert.js';
import { createScene, Rect } from '@glissade/scene';
import { timeline } from '@glissade/core';

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
    expect(() => assertCertVersion(99)).toThrow(CertVersionError);
    expect(() => assertCertVersion(1)).toThrow(CertVersionError); // v1 is retired — a v2 gs rejects it
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
    complete: true,
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
      complete: base.complete,
    };
    expect(H(reordered)).toBe(ref);
  });

  it('complete is NOT a determinant — flipping it HOLDS certHash (cacheability flag, not content-address)', () => {
    // `complete` is stripped before hashing: the SAME rendered bytes are certified
    // whether or not every drawn font was captured, so certHash must not move.
    expect(H({ ...base, complete: false })).toBe(H({ ...base, complete: true }));
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
      complete: true,
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

// ── 0.63.2 determinism-safety fix: font-completeness gates the render cache ──────

describe('(0.63.2) fontComplete — the completeness DECISION (pure)', () => {
  const S = (...f: string[]) => new Set(f);
  it('empty drawn set (no text drawn) → complete true (legitimately no font determinant)', () => {
    expect(fontComplete(S(), S())).toBe(true);
    expect(fontComplete(S(), S('brand'))).toBe(true);
  });
  it('every drawn family registered → true (case-insensitive)', () => {
    expect(fontComplete(S('brand sans'), S('brand sans'))).toBe(true);
    expect(fontComplete(S('Brand Sans'), S('brand sans'))).toBe(true); // drawn lower-cased on compare
  });
  it('any drawn family NOT registered → false (system font / partial capture)', () => {
    expect(fontComplete(S('sans-serif'), S())).toBe(false); // system-only
    expect(fontComplete(S('brand', 'sans-serif'), S('brand'))).toBe(false); // partial capture
  });
  it('buildVideoCertBase threads drawnFontFamilies into complete', async () => {
    const RC = { width: 100, height: 50, pixelFormat: 'rgba8-straight', imageSmoothing: true } as const;
    const scene = createScene({ size: { w: 100, h: 50 }, children: [new Rect({ id: 'r', position: [0, 0], width: 10, height: 10, fill: '#f00' })] });
    const mk = (drawn: string[], reg: string[]): Promise<VideoCertBase> =>
      buildVideoCertBase({
        scene, doc: timeline({ tracks: [] }), assetDigests: new Map(),
        registeredFamilies: new Set(reg), drawnFontFamilies: new Set(drawn),
        capsId: 'caps', captionBurnMode: 'burn', narrationTimingPath: null, renderConfig: RC, root: process.cwd(),
      } satisfies VideoCertBaseInputs);
    expect((await mk([], [])).complete).toBe(true); // no drawn text
    expect((await mk(['sans-serif'], [])).complete).toBe(false); // system font
    expect((await mk(['brand'], ['brand'])).complete).toBe(true); // captured
  });
});

describe('(0.63.2) complete — the DL-sample pre-pass sees what the render DRAWS', () => {
  const mkText = (family: string) => `
    import { createScene, Text } from '@glissade/scene';
    import { timeline } from '@glissade/core';
    const t = new Text({ id: 't', text: 'hi', fontFamily: '${family}', fontSize: 20, position: [10, 25] });
    export default { createScene: () => createScene({ size: { w: 120, h: 60 }, children: [t] }), timeline: timeline({ tracks: [] }) };`;

  it('STATIC system-font text (empty fontDigest) → complete === false', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'glissade-cert-static-'));
    const mod = join(dir, 'm.ts');
    writeFileSync(mod, mkText('sans-serif'));
    const out = join(dir, 'o');
    await render({ modulePath: mod, out, frame: 0, format: 'png-seq', certify: true });
    const m = readManifest(out);
    expect(m.base.fontDigest).toBe(''); // no font: assetDigest → empty (the bug's trigger)
    expect(m.base.complete).toBe(false); // the DL-walk saw a fillText with an uncaptured family
    rmSync(dir, { recursive: true, force: true });
  });

  it('a scene with NO text (pure geometry) → complete === true (NOT over-marked)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'glissade-cert-geo-'));
    const mod = join(dir, 'm.ts');
    writeFileSync(mod, `
      import { createScene, Rect } from '@glissade/scene';
      import { timeline } from '@glissade/core';
      const r = new Rect({ id: 'r', position: [10, 10], width: 40, height: 40, fill: '#f00' });
      export default { createScene: () => createScene({ size: { w: 120, h: 60 }, children: [r] }), timeline: timeline({ tracks: [] }) };`);
    const out = join(dir, 'o');
    await render({ modulePath: mod, out, frame: 0, format: 'png-seq', certify: true });
    const m = readManifest(out);
    expect(m.base.fontDigest).toBe('');
    expect(m.base.complete).toBe(true); // no fillText anywhere → no font determinant
    rmSync(dir, { recursive: true, force: true });
  });

  // ★ THE RED→GREEN acceptance target: TRACK-DRIVEN caption text. The captionNode's
  // `text` is EMPTY at construction (a Track<string> populates it at EVAL time), so a
  // construction-time scene-walk misses it → the old false-HIT. The DL-sample pre-pass
  // evaluates the certified grid and SEES the caption's fillText at the frames it draws.
  const captionMod = `
    import { timeline } from '@glissade/core';
    import { captionNode, captionTrack } from '@glissade/narrate';
    import { createScene } from '@glissade/scene';
    const SIZE = { w: 320, h: 180 };
    const timing = {
      timingVersion: 1, provider: 'test', providerVersion: 'test', totalDuration: 2, pauses: [],
      segments: [{ id: 'seg-1', text: 'a track-driven caption line', start: 0.3, duration: 1.2, file: '', words: [] }],
    };
    export default {
      createScene: () => createScene({ size: SIZE, children: [captionNode(SIZE, { fontFamily: 'sans-serif' })] }),
      timeline: timeline((tl) => { tl.tracks([captionTrack(timing)]); }, { fps: 10, duration: 2 }),
    };`;

  it('★ TRACK-DRIVEN caption with an UNCAPTURED (system) font → complete === false', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'glissade-cert-caption-'));
    const mod = join(dir, 'cap.ts');
    writeFileSync(mod, captionMod);
    const out = join(dir, 'o');
    // certify frames [0..15] @ fps 10 (t=0..1.5). The segment is active [0.3, 1.5] —
    // frame 0 (t=0) draws NO caption; frames >=3 DO. The full-grid pre-pass catches it.
    await render({ modulePath: mod, out, frameRange: [0, 15], format: 'png-seq', certify: true });
    const m = readManifest(out);
    expect(m.base.fontDigest).toBe(''); // the caption font is a SYSTEM family (uncaptured)
    expect(m.base.complete).toBe(false); // the DL-sample saw the caption's fillText at t>=0.3
    rmSync(dir, { recursive: true, force: true });
  });

  it('RENDER-NEUTRALITY — the completeness pre-pass does NOT perturb the rendered bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'glissade-cert-neutral-'));
    const mod = join(dir, 'cap.ts');
    writeFileSync(mod, captionMod);
    // WITHOUT the pre-pass: a plain render (certActive=false → no pre-pass runs).
    const plain = join(dir, 'plain');
    await render({ modulePath: mod, out: plain, frameRange: [0, 15], format: 'png-seq' });
    // WITH the pre-pass: --certify runs the DL-sample eval pass BEFORE the frame loop.
    const certified = join(dir, 'certified');
    await render({ modulePath: mod, out: certified, frameRange: [0, 15], format: 'png-seq', certify: true });
    for (let i = 0; i <= 15; i++) {
      const f = `frame-${String(i).padStart(5, '0')}.png`;
      expect(Buffer.compare(readFileSync(join(plain, f)), readFileSync(join(certified, f)))).toBe(0);
    }
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('(0.63.2) safety — an incomplete cert never SERVES or SEEDS a cache hit', () => {
  // An inline scene that DRAWS text with a SYSTEM family (no font asset) → complete:false.
  const incompleteMod = `
    import { createScene, Text } from '@glissade/scene';
    import { timeline } from '@glissade/core';
    const t = new Text({ id: 't', text: 'hi', fontFamily: 'sans-serif', fontSize: 20, position: [10, 25] });
    export default {
      createScene: () => createScene({ size: { w: 120, h: 60 }, children: [t] }),
      timeline: timeline({ tracks: [] }),
    };`;

  it('complete:false → cache get is SKIPPED (poison bytes are NOT served) and put is SKIPPED', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'glissade-cert-incomplete-'));
    const mod = join(dir, 'sys-text.ts');
    writeFileSync(mod, incompleteMod);
    const cacheDir = join(dir, 'cc');
    const cold = join(dir, 'cold');

    // cold render, read-write cache. The cert is incomplete → put is skipped.
    await render({ modulePath: mod, out: cold, frame: 0, format: 'png-seq', certify: true, certCache: { dir: cacheDir, mode: 'read-write' } });
    const m = readManifest(cold);
    expect(m.base.complete).toBe(false); // the scene draws an uncaptured system font
    const cache = new CertCache({ dir: cacheDir, mode: 'read-write' });
    expect(cache.entryCount()).toBe(0); // put was SKIPPED (an incomplete cert seeds nothing)

    // now POISON the cache under the exact certHash the render computes (from the
    // manifest). If get ran, this stale entry would be served — it must NOT be.
    const poison = Buffer.from('POISONED STALE BYTES — MUST NOT BE SERVED');
    cache.put(m.frames[0]!.certHash, poison);
    expect(cache.entryCount()).toBe(1);

    // read-only render: for an incomplete cert, get is skipped → it RE-RENDERS.
    const warm = join(dir, 'warm');
    await render({ modulePath: mod, out: warm, frame: 0, format: 'png-seq', certCache: { dir: cacheDir, mode: 'read-only' } });
    const coldPng = readFileSync(join(cold, 'frame-00000.png'));
    const warmPng = readFileSync(join(warm, 'frame-00000.png'));
    expect(Buffer.compare(warmPng, poison)).not.toBe(0); // poison was NOT served
    expect(Buffer.compare(warmPng, coldPng)).toBe(0); // re-rendered → byte-identical to cold
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('(0.63.2) cross-version retirement — a v2 read NEVER serves a v1-era entry', () => {
  it('a valid v1-layout entry (flat under dir/) is orphaned; a v2 get MISSES it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'glissade-cert-v1-'));
    const h = 'c'.repeat(64);

    // write a VALID v1-era entry the shipped 0.62 cache would have: flat at dir/<h>.gscb
    // with the GSBT magic header (the exact on-disk format v1's put() wrote).
    const header = Buffer.alloc(8);
    header.writeUInt32BE(0x47534254, 0); // 'GSBT'
    header.writeUInt32BE(1, 4);
    const staleBytes = Buffer.from('v1-era stale bytes — a latent FALSE-HIT');
    writeFileSync(join(dir, `${h}.gscb`), Buffer.concat([header, staleBytes]));

    // a v2 CertCache is version-namespaced (reads dir/v2/) → the v1 entry is invisible.
    const v2 = new CertCache({ dir, mode: 'read-write' });
    expect(v2.get(h)).toBeUndefined(); // MISS — the latent false-hit entry is retired
    expect(v2.entryCount()).toBe(0); // the flat v1 file is not in the v2 namespace

    // and a fresh v2 write of the SAME hash serves the NEW bytes, never v1's.
    const fresh = Buffer.from('fresh v2 bytes');
    v2.put(h, fresh);
    const hit = v2.get(h);
    expect(hit).toBeDefined();
    expect(Buffer.compare(hit!.bytes, fresh)).toBe(0);
    expect(Buffer.compare(hit!.bytes, staleBytes)).not.toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

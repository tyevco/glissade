/**
 * gs explain — the NON-mutating provenance reader over the determinism cert.
 *
 *   (a) reads a fixture `.cert.json` → the human report carries sceneHash /
 *       backendHash / frame count, surfaced VERBATIM from the manifest.
 *   (b) `--json` returns the structured shape.
 *   (c) sibling-cert resolution: `<artifact>` → `<artifact>.cert.json`.
 *   (d) fail-loud on a missing cert.
 *   (e) fail-loud on an unknown certVersion (assertCertVersion discipline).
 *   (f) `--cert` raw-frame-PNG byteHash match — a positive + a negative.
 *   det: the human report is byte-identical across two runs (no timestamps).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { explainCommand } from '../src/explain.js';
import { byteHashOf, CertVersionError, type VideoCertManifest } from '../src/cert.js';

const FIX = fileURLToPath(new URL('./fixtures/explain', import.meta.url));
const CERT = join(FIX, 'episode.mp4.cert.json');
const ARTIFACT = join(FIX, 'episode.mp4'); // does NOT exist — only its sibling .cert.json does
const BAD_VERSION = join(FIX, 'bad-version.cert.json');

const tmp = mkdtempSync(join(tmpdir(), 'glissade-explain-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('gs explain — provenance reader', () => {
  it('(a) reads a fixture .cert.json → provenance carries sceneHash/backendHash/frame count', () => {
    const { report, data } = explainCommand({ path: CERT });
    // hashes surfaced verbatim from the manifest.
    expect(report).toContain('scene-aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666');
    expect(report).toContain('backend-def0def0def0def0def0def0def0def0def0def0def0def0');
    expect(report).toContain('3 frames');
    expect(report).toContain('gs explain — determinism provenance');
    // the first/last byteHash summary (NOT all N lines).
    expect(report).toContain('byte0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa');
    expect(report).toContain('byte2222cccc2222cccc2222cccc2222cccc2222cccc2222cccc');
    // the MIDDLE frame's hash is NOT dumped (summary, not a full listing).
    expect(report).not.toContain('byte1111bbbb1111bbbb1111bbbb1111bbbb1111bbbb1111bbbb');
    expect(data.frames).toBe(3);
    expect(data.sceneHash).toBe('scene-aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666');
  });

  it('(b) --json returns the structured shape', () => {
    const { report, data } = explainCommand({ path: CERT, json: true });
    const parsed = JSON.parse(report) as typeof data;
    expect(parsed).toEqual(data);
    expect(parsed.certVersion).toBe(3);
    expect(parsed.kind).toBe('video');
    expect(parsed.sceneHash).toBe('scene-aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666');
    expect(parsed.timelineHash).toBe('timeline-0011223344556677889900aabbccddeeff00112233445566');
    expect(parsed.fontDigest).toBe('font-9988776655443322110099887766554433221100aabbccdd');
    expect(parsed.backendHash).toBe('backend-def0def0def0def0def0def0def0def0def0def0def0def0');
    expect(parsed.toolchainHash).toBe('toolchain-abcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabc');
    expect(parsed.frames).toBe(3);
    expect(parsed.fps).toBe(30);
    expect(parsed.durationSeconds).toBe(3 / 30);
    expect(parsed.complete).toBe(true);
    expect(parsed.renderConfig).toEqual({ width: 1920, height: 1080, pixelFormat: 'rgba8-straight', imageSmoothing: true });
    expect(parsed.firstFrame).toEqual({ i: 0, frameKey: '0@30', certHash: 'cert0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa', byteHash: 'byte0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa' });
    expect(parsed.lastFrame?.i).toBe(2);
  });

  it('(c) sibling-cert resolution: <artifact> → <artifact>.cert.json', () => {
    const { data } = explainCommand({ path: ARTIFACT });
    // resolved the sibling and read it (the artifact file itself does not exist).
    expect(data.source).toBe(CERT);
    expect(data.frames).toBe(3);
    expect(data.sceneHash).toBe('scene-aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666');
  });

  it('(d) fail-loud on a missing cert', () => {
    expect(() => explainCommand({ path: join(tmp, 'nope.mp4') })).toThrow(/no cert manifest found for/);
    expect(() => explainCommand({ path: join(tmp, 'nope.cert.json') })).toThrow(/no cert manifest at/);
  });

  it('(e) fail-loud on an unknown certVersion', () => {
    expect(() => explainCommand({ path: BAD_VERSION })).toThrow(CertVersionError);
    expect(() => explainCommand({ path: BAD_VERSION })).toThrow(/certVersion 999/);
  });

  it('(f) --cert raw-frame-PNG byteHash match — positive + negative', () => {
    // a manifest whose frame byteHashes we control, plus two "PNG" files whose byte
    // digests are computed the SAME way the cert hashes a frame (byteHashOf).
    const hitBytes = Buffer.from('the-emitted-png-bytes-of-frame-1');
    const missBytes = Buffer.from('some-other-png-that-is-not-in-the-manifest');
    const hitHash = byteHashOf(hitBytes);
    const manifest: VideoCertManifest = {
      certVersion: 3,
      kind: 'video',
      fps: 24,
      base: {
        certVersion: 3,
        sceneHash: 'scene-match-test',
        timelineHash: 'tl',
        narrationTimingHash: '',
        fontDigest: '',
        captionBurnMode: 'off',
        toolchainHash: 'tc',
        backendHash: 'be',
        renderConfig: { width: 10, height: 10, pixelFormat: 'rgba8-straight', imageSmoothing: false },
        complete: true,
      },
      frames: [
        { i: 0, frameKey: '0@24', certHash: 'c0', byteHash: 'byte-of-frame-0' },
        { i: 1, frameKey: '1@24', certHash: 'c1', byteHash: hitHash },
      ],
    };
    const manifestPath = join(tmp, 'match.cert.json');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const hitPng = join(tmp, 'frame-hit.png');
    const missPng = join(tmp, 'frame-miss.png');
    writeFileSync(hitPng, hitBytes);
    writeFileSync(missPng, missBytes);

    // positive: the PNG is frame 1.
    const pos = explainCommand({ path: hitPng, cert: manifestPath });
    expect(pos.data.frameMatch?.matched).toBe(true);
    expect(pos.data.frameMatch?.byteHash).toBe(hitHash);
    expect(pos.data.frameMatch?.frame?.i).toBe(1);
    expect(pos.report).toContain('frame #1');
    expect(pos.report).toContain('of sceneHash scene-match-test');

    // negative: no matching frame.
    const neg = explainCommand({ path: missPng, cert: manifestPath });
    expect(neg.data.frameMatch?.matched).toBe(false);
    expect(neg.data.frameMatch?.frame).toBeUndefined();
    expect(neg.report).toContain('no matching frame in the manifest');
  });

  it('(g) surfaces the sibling audio-cert stem hashes verbatim', () => {
    const { report, data } = explainCommand({ path: CERT });
    expect(data.audioCert?.narrationAudioHash).toBe('narr-1111222233334444555566667777888899990000aaaabbbb');
    expect(data.audioCert?.musicHash).toBe('music-aaaabbbbccccddddeeeeffff00001111222233334444555566');
    expect(data.audioCert?.sfxHash).toBe('');
    expect(data.audioCert?.loudness).toBe('-14.0 LUFS / -1.0 dBTP');
    expect(data.audioCert?.certHash).toBe('audiocert-cccc0000cccc0000cccc0000cccc0000cccc0000cccc00');
    // human report shows the stem hashes + loudness.
    expect(report).toContain('narration narr-1111222233334444555566667777888899990000aaaabbbb');
    expect(report).toContain('music     music-aaaabbbbccccddddeeeeffff00001111222233334444555566');
    expect(report).toContain('loudness  -14.0 LUFS / -1.0 dBTP');
    // an empty sfx hash renders as (none), not a blank.
    expect(report).toContain('sfx       (none)');
  });

  it('(det) the human report is byte-identical across two runs (no timestamps)', () => {
    const a = explainCommand({ path: CERT }).report;
    const b = explainCommand({ path: CERT }).report;
    expect(a).toBe(b);
  });
});

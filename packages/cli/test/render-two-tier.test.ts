/**
 * Two-tier render (0.71): `gs render --preview` is a WATCHABLE DRAFT — the SAME
 * rasterized frames as `--final` (crf is an ENCODE param only, deliberately NOT in
 * the frame-key digest, so a preview REUSES the final's frame cache — no re-raster)
 * encoded at a higher crf for a faster/lighter h264.
 *
 * The load-bearing safety property is TIER ISOLATION at the encode-artifact layer:
 * the remux fast path (`canRemux` → `ffmpeg -c:v copy` the existing stream) must
 * NEVER serve a preview's higher-crf video as a `--final` request (or vice versa).
 * That isolation is the new `RenderManifest.videoQuality` field folded into the
 * `canRemux` equality check. These are unit tests on the PURE pieces — the crf
 * tier map (`videoQualityArgs`/`videoQualityKey`) and `canRemux` — plus a fast
 * arg-parse fail-loud check on the built CLI. No heavy ffmpeg render required.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { videoQualityArgs, videoQualityKey } from '../src/render.js';
import { canRemux, frameKeyDigest, type RenderManifest } from '../src/renderManifest.js';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

describe('videoQualityArgs / videoQualityKey — the pure tier→crf map', () => {
  it('--final keeps the HISTORICAL byte-exact quality flags (default path never moves)', () => {
    // These are the exact values the pre-0.71 encode used — a change here would move
    // every default render's bytes (and every golden that goes through the encoder).
    expect(videoQualityArgs('libx264', 'final')).toEqual(['-crf', '18']);
    expect(videoQualityArgs('libvpx-vp9', 'final')).toEqual(['-b:v', '0', '-crf', '32']);
    expect(videoQualityArgs('libvpx', 'final')).toEqual(['-b:v', '2M']);
    expect(videoQualityArgs('libopenh264', 'final')).toEqual(['-b:v', '4M']);
    expect(videoQualityArgs('mpeg4', 'final')).toEqual(['-q:v', '3']);
  });

  it('--preview raises the crf on the crf-family encoders (lighter draft of the SAME frames)', () => {
    expect(videoQualityArgs('libx264', 'preview')).toEqual(['-crf', '30']);
    expect(videoQualityArgs('libvpx-vp9', 'preview')).toEqual(['-b:v', '0', '-crf', '40']);
    // a preview crf must be HIGHER (lossier/lighter) than the final crf
    expect(Number(videoQualityArgs('libx264', 'preview')[1])).toBeGreaterThan(
      Number(videoQualityArgs('libx264', 'final')[1]),
    );
  });

  it('an encoder with no draft override falls back to the final quality (identical bytes → safe to share)', () => {
    // libvpx / openh264 / mpeg4 have no preview point — preview == final for them.
    expect(videoQualityArgs('libvpx', 'preview')).toEqual(videoQualityArgs('libvpx', 'final'));
    expect(videoQualityArgs('mpeg4', 'preview')).toEqual(videoQualityArgs('mpeg4', 'final'));
  });

  it('videoQualityKey is the joined args string used as the manifest tier tag', () => {
    expect(videoQualityKey('libx264', 'final')).toBe('-crf 18');
    expect(videoQualityKey('libx264', 'preview')).toBe('-crf 30');
    // the two tiers produce DISTINCT keys → they can never cross-remux (see below)
    expect(videoQualityKey('libx264', 'preview')).not.toBe(videoQualityKey('libx264', 'final'));
  });
});

describe('canRemux — the cross-tier isolation (the load-bearing property)', () => {
  const digest = frameKeyDigest(['a', 'b', 'c']);
  const nowFinal = { frameKeyDigest: digest, container: 'mp4', videoCodec: 'libx264', videoQuality: '-crf 18', fps: 60, firstFrame: 0, frames: 3 };
  const nowPreview = { ...nowFinal, videoQuality: '-crf 30' };
  const manifest = (over: Partial<RenderManifest> = {}): RenderManifest => ({
    v: 1, frameKeyDigest: digest, container: 'mp4', videoCodec: 'libx264', videoQuality: '-crf 18', fps: 60, firstFrame: 0, frames: 3, ...over,
  });

  it('TRUE within a tier: everything incl. videoQuality matches (audio-only re-master)', () => {
    expect(canRemux(manifest({ videoQuality: '-crf 18' }), nowFinal, true)).toBe(true);
    expect(canRemux(manifest({ videoQuality: '-crf 30' }), nowPreview, true)).toBe(true);
  });

  it('FALSE cross-tier: a preview (crf 30) manifest must NOT remux-serve a --final (crf 18) request', () => {
    // identical frames (same digest) — ONLY the encode quality differs. Without the
    // videoQuality check this would `-c:v copy` the preview stream as the final = a
    // preview served as final. It must fall back to a full encode.
    expect(canRemux(manifest({ videoQuality: '-crf 30' }), nowFinal, true)).toBe(false);
  });

  it('FALSE cross-tier the other way: a final (crf 18) manifest must NOT serve a --preview request', () => {
    expect(canRemux(manifest({ videoQuality: '-crf 18' }), nowPreview, true)).toBe(false);
  });

  it('FALSE on a pre-0.71 manifest with ABSENT videoQuality (unknown quality → no false-hit)', () => {
    const old = manifest();
    delete (old as { videoQuality?: string }).videoQuality; // simulate an old-format manifest
    expect(old.videoQuality).toBeUndefined();
    expect(canRemux(old, nowFinal, true)).toBe(false);
    expect(canRemux(old, nowPreview, true)).toBe(false);
  });

  it('still gates on the pre-existing params (digest/codec/container/fps/frames) alongside quality', () => {
    // videoQuality is ADDITIVE — it doesn't loosen any prior gate.
    expect(canRemux(manifest({ frameKeyDigest: frameKeyDigest(['a', 'b', 'X']) }), nowFinal, true)).toBe(false);
    expect(canRemux(manifest({ videoCodec: 'libvpx-vp9' }), nowFinal, true)).toBe(false);
    expect(canRemux(manifest(), nowFinal, false)).toBe(false); // output gone
  });
});

// Arg-parse only (fail-loud happens BEFORE any scene load / render), so this is fast
// and needs only the built dist/cli.js — no ffmpeg, no valid scene module.
describe.runIf(existsSync(CLI))('gs render --preview / --final arg parsing', () => {
  const run = (...extra: string[]) =>
    spawnSync(process.execPath, [CLI, 'render', '/nonexistent/scene.ts', '--out', '/tmp/gs-two-tier-noop.mp4', ...extra], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  it('--preview and --final together → fail-loud (mutually exclusive)', () => {
    const r = run('--preview', '--final');
    expect(r.status).not.toBe(0);
    expect(r.stderr?.toString() ?? '').toMatch(/--preview and --final are mutually exclusive/);
  });
});

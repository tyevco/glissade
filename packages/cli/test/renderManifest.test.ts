/**
 * Render manifest (0.27): the frame-key digest + remux-eligibility logic behind
 * the audio-only `-c:v copy` fast path. Pure logic here (the ffmpeg remux itself
 * is EXPORT-gated / canary-validated); this pins the determinism-proof invariants.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canRemux, frameKeyDigest, readRenderManifest, writeRenderManifest, type RenderManifest } from '../src/renderManifest.js';

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'gs-manifest-')); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const base = (over: Partial<RenderManifest> = {}): RenderManifest => ({
  v: 1, frameKeyDigest: frameKeyDigest(['a', 'b', 'c']), container: 'mp4', videoCodec: 'libx264', fps: 60, firstFrame: 0, frames: 3, ...over,
});

describe('frameKeyDigest', () => {
  it('is order-sensitive and NUL-separated (no key-run collisions)', () => {
    expect(frameKeyDigest(['a', 'b'])).toBe(frameKeyDigest(['a', 'b']));
    expect(frameKeyDigest(['a', 'b'])).not.toBe(frameKeyDigest(['b', 'a'])); // order matters
    // 'a','b' must NOT collide with 'ab' (the separator prevents run-together)
    expect(frameKeyDigest(['a', 'b'])).not.toBe(frameKeyDigest(['ab']));
  });
});

describe('manifest read/write round-trip', () => {
  it('writes beside the video and reads back identically', () => {
    const out = join(dir, 'e07.mp4');
    const m = base();
    writeRenderManifest(out, m);
    expect(readRenderManifest(out)).toEqual(m);
  });
  it('returns undefined for a missing or wrong-version manifest', () => {
    expect(readRenderManifest(join(dir, 'nope.mp4'))).toBeUndefined();
    const out = join(dir, 'bad.mp4');
    writeFileSync(`${out}.gsrender.json`, JSON.stringify({ v: 99, frameKeyDigest: 'x' }));
    expect(readRenderManifest(out)).toBeUndefined();
  });
});

describe('canRemux — the fast-path gate (video-canary invariants)', () => {
  const now = { frameKeyDigest: frameKeyDigest(['a', 'b', 'c']), container: 'mp4', videoCodec: 'libx264', fps: 60, firstFrame: 0, frames: 3 };

  it('remux when digest + params match AND the prior output exists (audio-only change)', () => {
    expect(canRemux(base(), now, true)).toBe(true);
  });
  it('NO remux if the prior output file is gone', () => {
    expect(canRemux(base(), now, false)).toBe(false);
  });
  it('NO remux on a pixel change (digest differs) — key sensitivity', () => {
    expect(canRemux(base({ frameKeyDigest: frameKeyDigest(['a', 'b', 'X']) }), now, true)).toBe(false);
  });
  it('NO remux on an encode-param change (codec / container / fps / frame count)', () => {
    expect(canRemux(base({ videoCodec: 'libvpx-vp9' }), now, true)).toBe(false);
    expect(canRemux(base({ container: 'webm' }), now, true)).toBe(false);
    expect(canRemux(base({ fps: 30 }), now, true)).toBe(false);
    expect(canRemux(base({ frames: 4 }), now, true)).toBe(false);
  });
  it('NO remux with no prior manifest (first render)', () => {
    expect(canRemux(undefined, now, true)).toBe(false);
  });
});

/**
 * Render manifest (0.27): the frame-key digest + remux-eligibility logic behind
 * the audio-only `-c:v copy` fast path. Pure logic here (the ffmpeg remux itself
 * is EXPORT-gated / canary-validated); this pins the determinism-proof invariants.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canRemux, changedFrameRanges, frameKeyDigest, readRenderManifest, writeRenderManifest, type RenderManifest } from '../src/renderManifest.js';

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'gs-manifest-')); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const base = (over: Partial<RenderManifest> = {}): RenderManifest => ({
  v: 1, frameKeyDigest: frameKeyDigest(['a', 'b', 'c']), container: 'mp4', videoCodec: 'libx264', videoQuality: '-crf 18', fps: 60, firstFrame: 0, frames: 3, ...over,
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
  const now = { frameKeyDigest: frameKeyDigest(['a', 'b', 'c']), container: 'mp4', videoCodec: 'libx264', videoQuality: '-crf 18', fps: 60, firstFrame: 0, frames: 3 };

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

describe('changedFrameRanges (0.41 dirty-beat incremental)', () => {
  it('returns null when there is no prior key vector (→ full render)', () => {
    expect(changedFrameRanges(undefined, ['a', 'b', 'c'])).toBeNull();
  });

  it('returns null when the frame COUNT differs (a duration change → full render)', () => {
    expect(changedFrameRanges(['a', 'b'], ['a', 'b', 'c'])).toBeNull();
  });

  it('returns an EMPTY array when nothing changed (→ remux/copy, no re-render)', () => {
    expect(changedFrameRanges(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([]);
  });

  it('names a single changed frame as a 1-frame range', () => {
    expect(changedFrameRanges(['a', 'b', 'c'], ['a', 'X', 'c'])).toEqual([{ start: 1, end: 1 }]);
  });

  it('coalesces a contiguous changed run into one range', () => {
    // frames 2,3,4 changed → one range (the edit-one-beat, downstream reflow case)
    const prev = ['a', 'b', 'c', 'd', 'e', 'f'];
    const now = ['a', 'b', 'C', 'D', 'E', 'f'];
    expect(changedFrameRanges(prev, now)).toEqual([{ start: 2, end: 4 }]);
  });

  it('reports multiple disjoint changed runs', () => {
    const prev = ['a', 'b', 'c', 'd', 'e'];
    const now = ['A', 'b', 'C', 'd', 'E']; // 0, 2, 4 changed
    expect(changedFrameRanges(prev, now)).toEqual([
      { start: 0, end: 0 },
      { start: 2, end: 2 },
      { start: 4, end: 4 },
    ]);
  });

  it('handles a change running to the last frame', () => {
    const prev = ['a', 'b', 'c', 'd'];
    const now = ['a', 'b', 'X', 'Y'];
    expect(changedFrameRanges(prev, now)).toEqual([{ start: 2, end: 3 }]);
  });

  it('the dirty-beat win: an edit that reflows every downstream frame re-renders ONLY those', () => {
    // 100 frames; a beat edit at frame 40 shifts every downstream key → 40..99 changed,
    // 0..39 identical (spliced from the intermediate). 60 re-render, 40 copied.
    const prev = Array.from({ length: 100 }, (_, i) => `k${i}`);
    const now = prev.map((k, i) => (i >= 40 ? `k${i}-shifted` : k));
    const ranges = changedFrameRanges(prev, now)!;
    expect(ranges).toEqual([{ start: 40, end: 99 }]);
    const reRendered = ranges.reduce((n, r) => n + (r.end - r.start + 1), 0);
    expect(reRendered).toBe(60); // only 60 of 100 re-rendered, 40 spliced verbatim
  });
});

describe('RenderManifest frameKeys round-trip + backward-compat', () => {
  it('persists + reads the per-frame key vector', () => {
    const p = join(dir, 'withkeys.mp4');
    const m = base({ frameKeys: ['a', 'b', 'c'] });
    writeRenderManifest(p, m);
    expect(readRenderManifest(p)?.frameKeys).toEqual(['a', 'b', 'c']);
  });

  it('a pre-0.41 manifest with NO frameKeys still validates (incremental → falls back)', () => {
    const p = join(dir, 'nokeys.mp4');
    writeRenderManifest(p, base()); // no frameKeys
    const read = readRenderManifest(p);
    expect(read).toBeDefined();
    expect(read?.frameKeys).toBeUndefined();
    expect(changedFrameRanges(read?.frameKeys, ['a', 'b', 'c'])).toBeNull(); // → full render
  });
});

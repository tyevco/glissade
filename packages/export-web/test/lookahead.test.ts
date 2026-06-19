/**
 * Video lookahead buffer (F2IP, §5.4) — pure assertions, no real WebCodecs.
 * A fake mediabunny CanvasSink serves synthetic frames on the source grid so
 * we can prove:
 *   - warm() stays ~DEFAULT_LOOKAHEAD_FRAMES (10) ahead of a monotonic playhead;
 *   - the decoded-frame cache is BOUNDED (MAX_CACHED_FRAMES = 64) under a long
 *     monotonic walk — it never grows without limit;
 *   - BACKWARD scrub re-decodes from an earlier point and serves the right
 *     frame (a readiness latency, not cross-frame state — §5.4).
 */

import { describe, expect, it, vi } from 'vitest';

const SRC_FPS = 30;
const SRC_DURATION = 20; // 600 source frames — far more than MAX_CACHED_FRAMES

// Records each [from,to] window canvases() was asked for (shared with the
// hoisted vi.mock factory), so we can assert the lookahead decodes ahead.
const rec = vi.hoisted(() => ({
  fps: 30,
  duration: 20,
  windows: [] as { from: number; to: number }[],
}));

vi.mock('mediabunny', () => ({
  Input: class {
    constructor(public cfg: unknown) {}
    async getPrimaryVideoTrack() {
      return {
        async canDecode() {
          return true;
        },
        async computePacketStats() {
          return { averagePacketRate: rec.fps };
        },
        async computeDuration() {
          return rec.duration;
        },
      };
    }
  },
  ALL_FORMATS: [],
  UrlSource: class {
    constructor(public url: string) {}
  },
  BlobSource: class {},
  CanvasSink: class {
    constructor(
      public track: unknown,
      public opts: unknown,
    ) {}
    async *canvases(from: number, to: number): AsyncGenerator<{ timestamp: number; canvas: { tag: number } }> {
      rec.windows.push({ from, to });
      const first = Math.max(0, Math.floor(from * rec.fps));
      const last = Math.min(Math.floor(rec.duration * rec.fps) - 1, Math.ceil(to * rec.fps));
      for (let i = first; i <= last; i++) {
        yield { timestamp: i / rec.fps, canvas: { tag: i } };
      }
    }
  },
}));

import { MediabunnyVideoFrameSource, __cachedFrameCount } from '../src/videoSource.js';

const tag = (c: unknown): number => (c as { tag: number }).tag;

describe('MediabunnyVideoFrameSource lookahead + scrub (§5.4)', () => {
  it('keeps the cache bounded across a long monotonic walk', async () => {
    rec.windows.length = 0;
    const src = await MediabunnyVideoFrameSource.open('clip.mp4');
    expect(src.fps).toBe(SRC_FPS);

    // walk the playhead forward over the whole source, one frame at a time
    for (let f = 0; f < SRC_FPS * SRC_DURATION; f++) {
      const t = f / SRC_FPS;
      await src.warm(t, t);
      expect(tag(src.getFrameSync(t))).toBe(f); // exact source-grid frame
      // bounded memory: never exceeds the eviction ceiling
      expect(__cachedFrameCount(src)).toBeLessThanOrEqual(64);
    }
    src.close();
  });

  it('decodes ~10 frames ahead of a monotonic playhead', async () => {
    rec.windows.length = 0;
    const src = await MediabunnyVideoFrameSource.open('clip.mp4');
    // a single warm at t=0 should reach out to the lookahead horizon
    await src.warm(0, 0);
    const w = rec.windows[0]!;
    // toT = 0 + DEFAULT_LOOKAHEAD_FRAMES / fps = 10/30 s
    expect(w.to).toBeCloseTo(10 / SRC_FPS, 6);
    // the lookahead frames are present in the cache
    expect(__cachedFrameCount(src)).toBeGreaterThanOrEqual(10);
    src.close();
  });

  it('serves the correct frame after a BACKWARD scrub (re-decode, not stale state)', async () => {
    rec.windows.length = 0;
    const src = await MediabunnyVideoFrameSource.open('clip.mp4');

    // scrub far forward first
    const fwdT = 15;
    await src.warm(fwdT, fwdT);
    expect(tag(src.getFrameSync(fwdT))).toBe(Math.floor(fwdT * SRC_FPS));

    // ...then jump BACKWARD past the cached window
    const backT = 2;
    await src.warm(backT, backT);
    expect(tag(src.getFrameSync(backT))).toBe(Math.floor(backT * SRC_FPS));

    // the backward warm issued a fresh decode window starting at/around backT
    const last = rec.windows[rec.windows.length - 1]!;
    expect(last.from).toBeLessThanOrEqual(backT);
    expect(__cachedFrameCount(src)).toBeLessThanOrEqual(64);
    src.close();
  });
});

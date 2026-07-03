/**
 * Dirty-beat incremental (0.41): the PURE planning layer — segment interleave +
 * strategy decision. The ffmpeg splice itself is EXPORT-gated / canary-validated;
 * this pins the "which frames re-render, which splice verbatim" invariants that
 * keep a dirty-beat render byte-identical to a full cold render.
 */

import { describe, expect, it } from 'vitest';
import { planIncremental, spliceSegments } from '../src/incremental.js';
import { frameKeyDigest, type RenderManifest } from '../src/renderManifest.js';

const K = (n: number): string[] => Array.from({ length: n }, (_, i) => `k${i}`);
const manifest = (keys: string[], over: Partial<RenderManifest> = {}): RenderManifest => ({
  v: 1, frameKeyDigest: frameKeyDigest(keys), frameKeys: keys,
  container: 'mp4', videoCodec: 'libx264', fps: 60, firstFrame: 0, frames: keys.length, ...over,
});
const enc = (frames: number, over = {}) => ({ container: 'mp4', videoCodec: 'libx264', fps: 60, firstFrame: 0, frames, ...over });

describe('spliceSegments — complement & interleave', () => {
  it('one changed run in the middle → keep / render / keep', () => {
    expect(spliceSegments(10, [{ start: 3, end: 5 }])).toEqual([
      { start: 0, end: 2, kind: 'keep' },
      { start: 3, end: 5, kind: 'render' },
      { start: 6, end: 9, kind: 'keep' },
    ]);
  });

  it('a change at frame 0 has no leading keep', () => {
    expect(spliceSegments(6, [{ start: 0, end: 1 }])).toEqual([
      { start: 0, end: 1, kind: 'render' },
      { start: 2, end: 5, kind: 'keep' },
    ]);
  });

  it('a change running to the last frame has no trailing keep', () => {
    expect(spliceSegments(6, [{ start: 4, end: 5 }])).toEqual([
      { start: 0, end: 3, kind: 'keep' },
      { start: 4, end: 5, kind: 'render' },
    ]);
  });

  it('multiple disjoint runs interleave keep/render exactly', () => {
    expect(spliceSegments(10, [{ start: 2, end: 2 }, { start: 5, end: 6 }])).toEqual([
      { start: 0, end: 1, kind: 'keep' },
      { start: 2, end: 2, kind: 'render' },
      { start: 3, end: 4, kind: 'keep' },
      { start: 5, end: 6, kind: 'render' },
      { start: 7, end: 9, kind: 'keep' },
    ]);
  });

  it('segments are gap-free and cover the whole range', () => {
    const segs = spliceSegments(100, [{ start: 10, end: 12 }, { start: 40, end: 80 }]);
    expect(segs[0]!.start).toBe(0);
    expect(segs[segs.length - 1]!.end).toBe(99);
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.start).toBe(segs[i - 1]!.end + 1);
  });

  it('no changes → a single keep segment spanning everything', () => {
    expect(spliceSegments(5, [])).toEqual([{ start: 0, end: 4, kind: 'keep' }]);
  });
});

describe('planIncremental — strategy decision', () => {
  it('FULL when there is no prior manifest', () => {
    expect(planIncremental(undefined, K(10), true, enc(10)).kind).toBe('full');
  });

  it('FULL when the retained intermediate is gone', () => {
    expect(planIncremental(manifest(K(10)), K(10), false, enc(10)).kind).toBe('full');
  });

  it('FULL when the prior manifest predates 0.41 (no frameKeys)', () => {
    const old = manifest(K(10));
    delete (old as { frameKeys?: unknown }).frameKeys;
    expect(planIncremental(old, K(10), true, enc(10)).kind).toBe('full');
  });

  it('FULL on any encode-param change (codec / container / fps / range / count)', () => {
    const prev = manifest(K(10));
    expect(planIncremental(prev, K(10), true, enc(10, { videoCodec: 'libvpx-vp9' })).kind).toBe('full');
    expect(planIncremental(prev, K(10), true, enc(10, { container: 'webm' })).kind).toBe('full');
    expect(planIncremental(prev, K(10), true, enc(10, { fps: 30 })).kind).toBe('full');
    expect(planIncremental(prev, K(10), true, enc(10, { firstFrame: 1 })).kind).toBe('full');
    expect(planIncremental(prev, K(11), true, enc(11)).kind).toBe('full'); // frame count differs
  });

  it('UNCHANGED when every key matches (→ the remux path, no re-render)', () => {
    expect(planIncremental(manifest(K(10)), K(10), true, enc(10)).kind).toBe('unchanged');
  });

  it('SPLICE re-renders only the changed run — the dirty-beat win', () => {
    // 100-frame render; a beat edit at frame 40 reflows every downstream key.
    const prev = K(100);
    const now = prev.map((k, i) => (i >= 40 ? `${k}-shifted` : k));
    const plan = planIncremental(manifest(prev), now, true, enc(100));
    expect(plan.kind).toBe('splice');
    if (plan.kind !== 'splice') throw new Error('unreachable');
    expect(plan.renderFrames).toBe(60);
    expect(plan.totalFrames).toBe(100);
    expect(plan.changed).toEqual([{ start: 40, end: 99 }]);
    // the kept 0..39 splice verbatim; only 40..99 re-render
    expect(plan.segments).toEqual([
      { start: 0, end: 39, kind: 'keep' },
      { start: 40, end: 99, kind: 'render' },
    ]);
  });

  it('SPLICE with an interior edit re-renders a tiny fraction', () => {
    const prev = K(600); // 10s @ 60fps
    const now = prev.map((k, i) => (i >= 120 && i <= 180 ? `${k}!` : k)); // 1s edited
    const plan = planIncremental(manifest(prev), now, true, enc(600));
    if (plan.kind !== 'splice') throw new Error('expected splice');
    expect(plan.renderFrames).toBe(61); // ~10% of 600 re-rendered
    expect(plan.segments.map((s) => s.kind)).toEqual(['keep', 'render', 'keep']);
  });
});

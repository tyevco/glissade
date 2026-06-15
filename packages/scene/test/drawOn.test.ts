/**
 * Whiteboard kit: drawOn (one-call reveal track) + drawOnEach (cascade).
 */

import { describe, expect, it } from 'vitest';
import { sampleTrack, type Track } from '@glissade/core';
import { drawOn, drawOnEach } from '../src/drawOn.js';

describe('drawOn', () => {
  it('builds a <id>/reveal track running 0→1 over the window', () => {
    const tr = drawOn('box', { start: 0.5, duration: 2 });
    expect(tr.target).toBe('box/reveal');
    expect(tr.keys.map((k) => [k.t, k.value])).toEqual([[0.5, 0], [2.5, 1]]);
    expect(sampleTrack(tr as Track, 0.5)).toBe(0);
    expect(sampleTrack(tr as Track, 2.5)).toBe(1);
  });

  it('defaults: start 0, duration 1, easeInOutCubic', () => {
    const tr = drawOn('a');
    expect(tr.keys[0]!.t).toBe(0);
    expect(tr.keys[1]!.t).toBe(1);
    expect(tr.keys[1]!.ease).toBe('easeInOutCubic');
  });
});

describe('drawOnEach', () => {
  it('cascades one reveal track per id, staggered', () => {
    const tracks = drawOnEach(['a', 'b', 'c'], { duration: 1, delay: 0.5 });
    expect(tracks.map((t) => t.target)).toEqual(['a/reveal', 'b/reveal', 'c/reveal']);
    expect(tracks[0]!.keys.map((k) => k.t)).toEqual([0, 1]);
    expect(tracks[1]!.keys.map((k) => k.t)).toEqual([0.5, 1.5]);
    expect(tracks[2]!.keys.map((k) => k.t)).toEqual([1, 2]);
  });

  it('default delay is 0.6 × duration', () => {
    const tracks = drawOnEach(['a', 'b'], { duration: 2 });
    expect(tracks[1]!.keys[0]!.t).toBeCloseTo(1.2, 9); // 0.6 × 2
  });
});

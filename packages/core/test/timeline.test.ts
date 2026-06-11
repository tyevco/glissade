import { describe, expect, it, vi } from 'vitest';
import {
  compileTimeline,
  key,
  sampleTrack,
  setDevWarning,
  spring,
  timeline,
  track,
  type Vec2,
  TimelineValidationError,
} from '../src/index.js';

const demoDoc = () =>
  timeline({
    tracks: [
      track('circle/opacity', 'number', [
        key(0, 0),
        key(1, 1, 'easeInOutCubic'),
        key(2, 1, { interp: 'hold' }),
        key(2.5, 0, 'easeOutQuad'),
      ]),
      track('circle/position.x', 'number', [key(1, 0), key(2, 300, 'easeInOutCubic')]),
      track('circle/scale', 'vec2', [key<Vec2>(1, [1, 1]), key<Vec2>(2, [2, 2])]),
    ],
    labels: { settled: 2 },
  });

describe('document + compile', () => {
  it('computes duration from the max key t', () => {
    expect(compileTimeline(demoDoc()).duration).toBe(2.5);
  });

  it('explicit duration overrides', () => {
    const doc = timeline({ tracks: [track('a/x', 'number', [key(0, 0), key(1, 1)])], duration: 10 });
    expect(compileTimeline(doc).duration).toBe(10);
  });

  it('JSON round-trip is stable and compiles identically', () => {
    const doc = demoDoc();
    const roundTripped = JSON.parse(JSON.stringify(doc)) as ReturnType<typeof demoDoc>;
    expect(roundTripped).toEqual(doc);
    const a = compileTimeline(doc);
    const b = compileTimeline(roundTripped);
    expect(b.duration).toBe(a.duration);
    expect([...b.tracks.keys()]).toEqual([...a.tracks.keys()]);
    for (const t of [0, 0.5, 1.25, 2.2, 2.5]) {
      expect(sampleTrack(b.tracks.get('circle/opacity')!, t)).toBe(
        sampleTrack(a.tracks.get('circle/opacity')!, t),
      );
    }
  });

  it('rejects unknown document versions', () => {
    const doc = { ...demoDoc(), version: 2 as unknown as 1 };
    expect(() => compileTimeline(doc)).toThrow(TimelineValidationError);
  });
});

describe('coalescing (§2.2: one track per target, last insertion wins)', () => {
  it('merges disjoint same-target tracks silently', () => {
    const warn = vi.fn();
    setDevWarning(warn);
    const doc = timeline({
      tracks: [
        track('a/x', 'number', [key(0, 0), key(1, 1)]),
        track('a/x', 'number', [key(2, 5), key(3, 6)]),
      ],
    });
    const compiled = compileTimeline(doc);
    expect(warn).not.toHaveBeenCalled();
    const merged = compiled.tracks.get('a/x')!;
    expect(merged.keys.map((k) => k.t)).toEqual([0, 1, 2, 3]);
  });

  it('overlap: later insertion wins, dev warning fires', () => {
    const warn = vi.fn();
    setDevWarning(warn);
    const doc = timeline({
      tracks: [
        track('a/x', 'number', [key(0, 0), key(2, 10)]),
        track('a/x', 'number', [key(1, 100), key(3, 200)]),
      ],
    });
    const merged = compileTimeline(doc).tracks.get('a/x')!;
    expect(warn).toHaveBeenCalledTimes(1);
    expect(merged.keys.map((k) => k.t)).toEqual([0, 1, 3]); // key at t=2 dropped (inside [1,3])
    expect(sampleTrack(merged, 3)).toBe(200);
  });

  it('conflicting value types on one target throw', () => {
    const doc = timeline({
      tracks: [
        track('a/x', 'number', [key(0, 0)]),
        track('a/x', 'vec2', [key(1, [0, 0] as const)]),
      ],
    });
    expect(() => compileTimeline(doc)).toThrow(TimelineValidationError);
  });
});

describe('nesting (§2.3 add vs sync)', () => {
  const child = () =>
    timeline({
      tracks: [track('b/x', 'number', [key(0, 0), key(1, 10)])],
      labels: { mid: 0.5 },
    });

  it("'add' children flatten with rebased keys", () => {
    const doc = timeline({ children: [{ timeline: child(), at: 2, mode: 'add' }] });
    const compiled = compileTimeline(doc);
    expect(compiled.tracks.get('b/x')!.keys.map((k) => k.t)).toEqual([2, 3]);
    expect(compiled.duration).toBe(3);
    expect(compiled.labels['mid']).toBe(2.5);
  });

  it("'sync' children scrub through timeScale", () => {
    const doc = timeline({ children: [{ timeline: child(), at: 1, mode: 'sync', timeScale: 2 }] });
    const compiled = compileTimeline(doc);
    // child plays double speed: its 1s of content occupies [1, 1.5] on the parent axis
    const tr = compiled.tracks.get('b/x')!;
    expect(tr.keys.map((k) => k.t)).toEqual([1, 1.5]);
    expect(sampleTrack(tr, 1.25)).toBe(5);
    expect(compiled.duration).toBe(1.5);
  });

  it('add children coalesce against parent tracks; sync children stay opaque units', () => {
    const warn = vi.fn();
    setDevWarning(warn);
    const overlapping = timeline({ tracks: [track('a/x', 'number', [key(0, 100), key(1, 200)])] });
    const doc = timeline({
      tracks: [track('a/x', 'number', [key(0, 0), key(2, 10)])],
      children: [{ timeline: overlapping, at: 0.5, mode: 'add' }],
    });
    const merged = compileTimeline(doc).tracks.get('a/x')!;
    expect(warn).toHaveBeenCalled(); // child landed inside the parent's span → overlap rule
    expect(sampleTrack(merged, 1.5)).toBe(200);
  });

  it('nested sync scales compose', () => {
    const inner = timeline({ tracks: [track('c/x', 'number', [key(0, 0), key(4, 4)])] });
    const mid = timeline({ children: [{ timeline: inner, at: 2, mode: 'sync', timeScale: 2 }] });
    const doc = timeline({ children: [{ timeline: mid, at: 1, mode: 'sync', timeScale: 2 }] });
    // inner local 4s → /2 → /2 = 1s on root; offset: 1 + 2/2 = 2
    const tr = compileTimeline(doc).tracks.get('c/x')!;
    expect(tr.keys.map((k) => k.t)).toEqual([2, 3]);
  });

  it("timeScale on 'add' children is rejected", () => {
    const doc = timeline({ children: [{ timeline: child(), at: 0, mode: 'add', timeScale: 2 }] });
    expect(() => compileTimeline(doc)).toThrow(TimelineValidationError);
  });
});

describe('spring key rule (§2.7)', () => {
  it('accepts a spring key at prev.t + spring.duration', () => {
    const cfg = { stiffness: 170, damping: 26, mass: 1 };
    const d = spring.duration(cfg);
    const doc = timeline({
      tracks: [track('a/x', 'number', [key(0, 0), key(d, 300, spring(cfg))])],
    });
    expect(() => compileTimeline(doc)).not.toThrow();
  });

  it('rejects a spring key at the wrong t', () => {
    const cfg = { stiffness: 170, damping: 26, mass: 1 };
    const doc = timeline({
      tracks: [track('a/x', 'number', [key(0, 0), key(99, 300, spring(cfg))])],
    });
    expect(() => compileTimeline(doc)).toThrow(TimelineValidationError);
  });
});

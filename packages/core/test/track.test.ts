import { describe, expect, it } from 'vitest';
import { key, sampleTrack, spring, springTo, track, TrackValidationError, type Track, type Vec2 } from '../src/index.js';

const demo = () =>
  track('circle/opacity', 'number', [
    key(0, 0),
    key(1, 1, 'easeInOutCubic'),
    key(2, 1, { interp: 'hold' }),
    key(2.5, 0, 'easeOutQuad'),
  ]);

describe('track validation', () => {
  it('rejects unsorted keys', () => {
    expect(() => track('a/x', 'number', [key(1, 0), key(0.5, 1)])).toThrow(TrackValidationError);
  });

  it('rejects duplicate key times', () => {
    expect(() => track('a/x', 'number', [key(1, 0), key(1, 1)])).toThrow(TrackValidationError);
  });

  it('rejects empty tracks and malformed targets', () => {
    expect(() => track('a/x', 'number', [])).toThrow(TrackValidationError);
    expect(() => track('no-slash', 'number', [key(0, 0)])).toThrow(TrackValidationError);
  });
});

describe('sampling (§2.4)', () => {
  it('clamps before the first and after the last key', () => {
    const tr = demo();
    expect(sampleTrack(tr, -5)).toBe(0);
    expect(sampleTrack(tr, 99)).toBe(0);
  });

  it('hits keys exactly', () => {
    const tr = demo();
    expect(sampleTrack(tr, 0)).toBe(0);
    expect(sampleTrack(tr, 1)).toBe(1);
    expect(sampleTrack(tr, 2.5)).toBe(0);
  });

  it('eases the arriving segment', () => {
    const tr = demo();
    expect(sampleTrack(tr, 0.5)).toBeCloseTo(0.5, 9); // easeInOutCubic midpoint
    expect(sampleTrack(tr, 0.25)).toBeCloseTo(4 * 0.25 ** 3, 9);
  });

  it('hold keys step: previous value until the key t', () => {
    const tr = demo();
    expect(sampleTrack(tr, 1.5)).toBe(1);
    expect(sampleTrack(tr, 1.999)).toBe(1);
    expect(sampleTrack(tr, 2)).toBe(1); // at the hold key, segment to 2.5 starts from 1
    expect(sampleTrack(tr, 2.25)).toBeCloseTo(1 - (1 - (1 - 0.5) ** 2), 9); // easeOutQuad(0.5) toward 0
  });

  it('default ease is linear when unspecified', () => {
    const tr = track('a/x', 'number', [key(0, 0), key(2, 10)]);
    expect(sampleTrack(tr, 1)).toBe(5);
  });

  it('cursor memoization ≡ cold search (random-order property test)', () => {
    const keys = Array.from({ length: 50 }, (_, i) => key(i * 0.1, Math.sin(i)));
    const warm = track('a/x', 'number', keys);
    // a structurally identical track, sampled fresh each time via clone
    const times = Array.from({ length: 500 }, (_, i) => ((i * 7919) % 600) / 100 - 0.5);
    for (const t of times) {
      const cold: Track = JSON.parse(JSON.stringify(warm)) as Track;
      expect(sampleTrack(warm, t)).toBe(sampleTrack(cold, t));
    }
  });

  it('sampling is pure: twice ≡ once, any order', () => {
    const tr = demo();
    const ts = [2.4, 0.1, 1.7, 0.9, 2.0, 0.5, 2.5, 0];
    const first = ts.map((t) => sampleTrack(tr, t));
    const second = ts.map((t) => sampleTrack(tr, t));
    expect(second).toEqual(first);
    const reversed = [...ts].reverse().map((t) => sampleTrack(tr, t));
    expect(reversed).toEqual([...first].reverse());
  });

  it('vec2 and color tracks sample through their value types', () => {
    const v = track('a/scale', 'vec2', [key<Vec2>(0, [1, 1]), key<Vec2>(1, [2, 2])]);
    expect(sampleTrack(v, 0.5)).toEqual([1.5, 1.5]);
    const c = track('a/fill', 'color', [key(0, '#000000'), key(1, '#ffffff')]);
    expect(sampleTrack(c, 0)).toBe('#000000');
    expect(sampleTrack(c, 1)).toBe('#ffffff');
  });
});

describe('springTo (§2.7 beat-anchored authoring)', () => {
  const cfg = { stiffness: 120, damping: 14 };

  it('returns the [launch, settle] pair with the duration arithmetic done', () => {
    const d = spring.duration(cfg);
    const [launch, settle] = springTo(3, 0, 100, cfg);
    expect(launch).toEqual({ t: 3 - d, value: 0 });
    expect(settle.t).toBe(3);
    expect(settle.value).toBe(100);
    expect(settle.ease).toEqual(spring(cfg));
  });

  it('the pair spreads straight into a valid raw track', () => {
    const tr = track('x/width', 'number', [...springTo(3, 0, 100, cfg)]);
    expect(tr.keys).toHaveLength(2);
    expect(sampleTrack(tr, 3)).toBeCloseTo(100, 6);
  });

  it('an endT earlier than the settle duration fails with a clear message', () => {
    expect(() => springTo(0.1, 0, 1, cfg)).toThrow(/needs .*s to settle/);
  });
});

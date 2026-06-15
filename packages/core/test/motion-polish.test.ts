/**
 * Motion polish: named spring presets + the stagger helper.
 */

import { describe, expect, it } from 'vitest';
import { key, spring, springPresets, stagger, track, type Track } from '../src/index.js';

describe('springPresets', () => {
  it('every preset is a valid spring config with a positive settle time', () => {
    for (const [name, cfg] of Object.entries(springPresets)) {
      expect(() => spring(cfg), name).not.toThrow();
      expect(spring.duration(cfg), name).toBeGreaterThan(0);
    }
  });

  it('reads as a vocabulary: spring(springPresets.wobbly)', () => {
    expect(spring(springPresets.wobbly)).toEqual({ kind: 'spring', stiffness: 180, damping: 12, mass: 1 });
  });
});

describe('stagger', () => {
  const mk = (id: string) => track(`${id}/x`, 'number', [key(0, 0), key(1, 1, 'easeOutCubic')]);

  it('shifts each track by index × delay', () => {
    const out = stagger([mk('a'), mk('b'), mk('c')], 0.5);
    expect(out[0]!.keys.map((k) => k.t)).toEqual([0, 1]); // index 0: no shift
    expect(out[1]!.keys.map((k) => k.t)).toEqual([0.5, 1.5]); // index 1: +0.5
    expect(out[2]!.keys.map((k) => k.t)).toEqual([1, 2]); // index 2: +1.0
  });

  it('accepts a per-index delay function', () => {
    const out = stagger([mk('a'), mk('b')], (i) => i * i * 0.1);
    expect(out[1]!.keys[0]!.t).toBeCloseTo(0.1, 9);
  });

  it('is pure — the input tracks are untouched, eases preserved', () => {
    const t = mk('a');
    const out = stagger([t, mk('b')], 0.5);
    expect(t.keys[0]!.t).toBe(0); // original unchanged
    expect((out[1] as Track).keys[1]!.ease).toBe('easeOutCubic'); // ease carried through
  });
});

import { describe, expect, it } from 'vitest';
import { key, track, TrackValidationError, type Key, type Track, type Vec2 } from '../src/index.js';
import { clip, clipList, ClipError } from '../src/clips.js';
import { popIn, slideIn, pulse, driftLoop } from '../src/clips.js';

describe('clip — the determinism invariant', () => {
  it('clip().apply() is deep-equal to the hand-authored track() form', () => {
    const c = clip({
      channels: {
        fade: { path: 'opacity', keys: [key(0, 0), key(0.3, 1, 'easeOutCubic')] },
        scale: { path: 'scale', keys: [key(0, 0.8), key(0.3, 1, 'easeOutCubic')] },
      },
    });
    const { tracks, end } = c.apply('card', 1.0);

    const hand: Track[] = [
      track('card/opacity', 'number', [key(1.0, 0), key(1.3, 1, 'easeOutCubic')]),
      track('card/scale', 'number', [key(1.0, 0.8), key(1.3, 1, 'easeOutCubic')]),
    ];

    expect(tracks).toEqual(hand);
    expect(end).toBe(1.3);
  });

  it('emits the same derived/interp/id flags as a literal track', () => {
    const c = clip({
      channels: {
        x: { path: 'x', keys: [key(0, 0, { interp: 'hold', id: 'k0' }), key(1, 5, { ease: 'linear', derived: true })] },
      },
    });
    const { tracks } = c.apply('node', 0);
    const hand = track('node/x', 'number', [
      key(0, 0, { interp: 'hold', id: 'k0' }),
      key(1, 5, { ease: 'linear', derived: true }),
    ]);
    expect(tracks[0]).toEqual(hand);
  });

  it("carries a key's `from` ('live') flag through verbatim — byte-indistinguishable", () => {
    // `from` is part of the authored Key shape (§4.7); the emitted track must keep it.
    // key() doesn't author `from`, so construct the literal keys directly.
    const k0: Key = { t: 0, value: 0, from: 'live' };
    const k1: Key = { t: 1, value: 5, ease: 'linear' };
    const c = clip({ channels: { x: { path: 'x', keys: [k0, k1] } } });
    const { tracks } = c.apply('node', 0);
    const hand = track('node/x', 'number', [
      { t: 0, value: 0, from: 'live' },
      { t: 1, value: 5, ease: 'linear' },
    ]);
    expect(tracks[0]).toEqual(hand);
    expect(tracks[0]!.keys[0]!.from).toBe('live');
  });

  it('drops `derived` on a key whose value an override REPLACED (no longer derived)', () => {
    // both keys flagged derived; an override replaces both values → neither is derived.
    const c = clip({
      channels: { o: { path: 'opacity', keys: [key(0, 0, { derived: true }), key(1, 1, { derived: true })] } },
    });
    const { tracks } = c.apply('n', 0, { overrides: { o: { from: 0.2, to: 0.9 } } });
    const hand = track('n/opacity', 'number', [key(0, 0.2), key(1, 0.9)]);
    expect(tracks[0]).toEqual(hand);
    expect(tracks[0]!.keys[0]!.derived).toBeUndefined();
    expect(tracks[0]!.keys[1]!.derived).toBeUndefined();
  });

  it('keeps `derived` on a key the override did NOT touch', () => {
    // 3 keys all derived; only first (from) and last (to) overridden → middle key keeps it.
    const c = clip({
      channels: {
        o: {
          path: 'opacity',
          keys: [key(0, 0, { derived: true }), key(0.5, 0.5, { derived: true }), key(1, 1, { derived: true })],
        },
      },
    });
    const { tracks } = c.apply('n', 0, { overrides: { o: { from: 0.2, to: 0.9 } } });
    expect(tracks[0]!.keys[0]!.derived).toBeUndefined();
    expect(tracks[0]!.keys[1]!.derived).toBe(true);
    expect(tracks[0]!.keys[2]!.derived).toBeUndefined();
  });

  it('rejects an ambiguous single-key override (`from` on a 1-key channel), naming the channel', () => {
    const c = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0)] } } });
    expect(() => c.apply('card', 0, { overrides: { o: { from: 0.5 } } })).toThrow(ClipError);
    expect(() => c.apply('card', 0, { overrides: { o: { from: 0.5 } } })).toThrow(/single-key|ambiguous/);
    expect(() => c.apply('card', 0, { overrides: { o: { from: 0.5 } } })).toThrow(/card\/opacity/);
    // both from+to on one key is likewise rejected
    expect(() => c.apply('card', 0, { overrides: { o: { from: 0.1, to: 0.9 } } })).toThrow(ClipError);
    // a `to`-only override on a single-key channel is unambiguous and still allowed
    expect(() => c.apply('card', 0, { overrides: { o: { to: 0.9 } } })).not.toThrow();
  });
});

describe('clip — speed', () => {
  it('divides every relative t and sets end accordingly', () => {
    const c = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(1, 1)] } } });
    const { tracks, end } = c.apply('n', 2, { speed: 2 });
    expect(tracks[0]!.keys.map((k) => k.t)).toEqual([2, 2.5]);
    expect(end).toBe(2.5);
  });

  it('rejects non-positive speed', () => {
    const c = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(1, 1)] } } });
    expect(() => c.apply('n', 0, { speed: 0 })).toThrow(ClipError);
    expect(() => c.apply('n', 0, { speed: -1 })).toThrow(ClipError);
  });
});

describe('clip — overrides (value/ease only, topology preserved)', () => {
  it('patches first value (from), last value (to), and last-segment ease', () => {
    const c = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(0.5, 0.5, 'linear'), key(1, 1, 'linear')] } } });
    const { tracks } = c.apply('n', 0, { overrides: { o: { from: 0.2, to: 0.9, ease: 'easeInQuad' } } });
    expect(tracks[0]!.keys).toEqual([
      key(0, 0.2),
      key(0.5, 0.5, 'linear'),
      key(1, 0.9, 'easeInQuad'),
    ]);
  });

  it('does not add or remove keys', () => {
    const c = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(1, 1)] } } });
    const { tracks } = c.apply('n', 0, { overrides: { o: { to: 0.5 } } });
    expect(tracks[0]!.keys.length).toBe(2);
  });

  it('throws on an override for an unknown channel', () => {
    const c = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(1, 1)] } } });
    expect(() => c.apply('n', 0, { overrides: { nope: { to: 1 } } })).toThrow(ClipError);
  });

  it('rejects a mismatched-TYPE override value (no silent NaN into the backends)', () => {
    // A vec2 channel (position) with a NUMBER override → would sample to [NaN,NaN]
    // through evaluate() into both backends. The clip must throw, not pass NaN.
    const c = clip({
      channels: { pos: { path: 'position', keys: [key(0, [0, 0] as Vec2), key(0.3, [10, 0] as Vec2)] } },
    });
    expect(() => c.apply('card', 0, { overrides: { pos: { to: 0.5 } } })).toThrow(ClipError);
    expect(() => c.apply('card', 0, { overrides: { pos: { to: 0.5 } } })).toThrow(/vec2|NaN/);
    // a from-side mismatch is caught too
    expect(() => c.apply('card', 0, { overrides: { pos: { from: 3 } } })).toThrow(ClipError);
    // the inverse: a vec2 override on a NUMBER channel
    const n = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(0.3, 1)] } } });
    expect(() => n.apply('card', 0, { overrides: { o: { to: [1, 2] as unknown as number } } })).toThrow(ClipError);
  });

  it('a CORRECT-type override still works (vec2 → vec2, number → number)', () => {
    const c = clip({
      channels: { pos: { path: 'position', keys: [key(0, [0, 0] as Vec2), key(0.3, [10, 0] as Vec2)] } },
    });
    const { tracks } = c.apply('card', 0, { overrides: { pos: { from: [5, 5] as Vec2, to: [20, 0] as Vec2 } } });
    expect(tracks[0]!.keys[0]!.value).toEqual([5, 5]);
    expect(tracks[0]!.keys[1]!.value).toEqual([20, 0]);
    const n = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(0.3, 1)] } } });
    expect(() => n.apply('card', 0, { overrides: { o: { to: 0.5 } } })).not.toThrow();
  });
});

describe('clip — target map (per-channel path override)', () => {
  it('resolves each channel against its mapped TweenTarget', () => {
    const c = clip({
      channels: {
        glow: { path: 'opacity', keys: [key(0, 0), key(0.5, 1)] },
        body: { path: 'opacity', keys: [key(0, 0), key(0.5, 1)] },
      },
    });
    const { tracks } = c.apply({ glow: 'card-halo/opacity', body: 'card/opacity' }, 0);
    expect(tracks.map((t) => t.target).sort()).toEqual(['card-halo/opacity', 'card/opacity']);
  });

  it('throws when the map is missing a channel', () => {
    const c = clip({ channels: { a: { path: 'opacity', keys: [key(0, 0), key(1, 1)] }, b: { path: 'opacity', keys: [key(0, 0), key(1, 1)] } } });
    expect(() => c.apply({ a: 'n/opacity' }, 0)).toThrow(ClipError);
  });

  it('rejects structural / anonymous node ids (via resolveTweenTarget)', () => {
    const c = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(1, 1)] } } });
    expect(() => c.apply('~Rect.0', 0)).toThrow();
  });
});

describe('clip — type inference', () => {
  it('infers vec2 from the first key value', () => {
    const c = clip({ channels: { p: { path: 'position', keys: [key(0, [0, 0] as Vec2), key(1, [10, 10] as Vec2)] } } });
    const { tracks } = c.apply('n', 0);
    expect(tracks[0]!.type).toBe('vec2');
  });

  it('honors an explicit type', () => {
    const c = clip({ channels: { v: { path: 'visible', type: 'boolean', keys: [key(0, false), key(1, true)] } } });
    const { tracks } = c.apply('n', 0);
    expect(tracks[0]!.type).toBe('boolean');
  });
});

describe('clipList — fan-out + stagger', () => {
  it('applies to each target, offsetting child i by the stagger delay', () => {
    const c = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(0.3, 1)] } } });
    const { tracks, end } = clipList(c, ['a', 'b', 'c'], 0, { stagger: 0.1 });
    expect(tracks.map((t) => t.target)).toEqual(['a/opacity', 'b/opacity', 'c/opacity']);
    expect(tracks.map((t) => t.keys[0]!.t)).toEqual([0, 0.1, 0.2]);
    expect(end).toBeCloseTo(0.5, 10); // last child starts at 0.2, ends at 0.5
  });

  it('accepts a function delay', () => {
    const c = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(0.3, 1)] } } });
    const { tracks } = clipList(c, ['a', 'b'], 0, { stagger: (i) => i * i * 0.2 });
    expect(tracks.map((t) => t.keys[0]!.t)).toEqual([0, 0.2]);
  });

  it('matches clip().apply() called per-target (deep-equal)', () => {
    const c = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(0.3, 1, 'easeOutCubic')] } } });
    const list = clipList(c, ['a', 'b'], 1, { stagger: 0.1 });
    const manual = [
      ...c.apply('a', 1).tracks,
      ...c.apply('b', 1.1).tracks,
    ];
    expect(list.tracks).toEqual(manual);
  });
});

describe('clip — validateTrack still guards', () => {
  it('a clip authored with non-increasing t throws at apply (via track())', () => {
    // crafted directly because the public key() can't author backwards t in one channel;
    // verify the compile path runs validateTrack by forcing a duplicate-t schedule.
    const c = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(0, 1)] } } });
    expect(() => c.apply('n', 0)).toThrow(TrackValidationError);
  });
});

describe('clip stdlib', () => {
  it('popIn binds opacity 0→1 and a VEC2 scale [0.8,0.8]→[1,1]', () => {
    const { tracks, end } = popIn().apply('card', 0);
    const byTarget = Object.fromEntries(tracks.map((t) => [t.target, t]));
    expect(byTarget['card/opacity']!.keys.map((k) => k.value)).toEqual([0, 1]);
    // the scene `scale` prop is a Vec2Signal: popIn must author vec2 keys so the
    // channel infers 'vec2' and samples to a real [s,s] (not [undefined,undefined]).
    expect(byTarget['card/scale']!.type).toBe('vec2');
    expect(byTarget['card/scale']!.keys.map((k) => k.value)).toEqual([
      [0.8, 0.8],
      [1, 1],
    ]);
    expect(end).toBeCloseTo(0.3, 10);
  });

  it('pulse authors a VEC2 scale (1 → peak → 1) so it samples on a vec2 prop', () => {
    const { tracks } = pulse({ scale: 1.2, duration: 0.4 }).apply('card', 0);
    const scale = tracks.find((t) => t.target === 'card/scale')!;
    expect(scale.type).toBe('vec2');
    expect(scale.keys.map((k) => k.value)).toEqual([
      [1, 1],
      [1.2, 1.2],
      [1, 1],
    ]);
  });

  it('slideIn offsets a position channel in from the named edge', () => {
    const { tracks } = slideIn('left').apply('card', 0);
    const pos = tracks.find((t) => t.target === 'card/position')!;
    expect(pos.keys[0]!.value).toEqual([-40, 0]);
    expect(pos.keys[pos.keys.length - 1]!.value).toEqual([0, 0]);
  });

  it('pulse and driftLoop are loopable (first value == last value)', () => {
    for (const c of [pulse(), driftLoop()]) {
      const { tracks } = c.apply('n', 0);
      for (const t of tracks) {
        expect(t.keys[0]!.value).toEqual(t.keys[t.keys.length - 1]!.value);
      }
    }
  });

  it('stdlib clips tile under clipList without producing non-increasing t', () => {
    const { tracks } = clipList(pulse({ duration: 0.4 }), ['a', 'b', 'c'], 0, { stagger: 0.2 });
    // every emitted track passed validateTrack already (clipList → apply → track());
    // assert monotonic t as a belt-and-suspenders regression guard
    for (const t of tracks) {
      for (let i = 1; i < t.keys.length; i++) {
        expect(t.keys[i]!.t).toBeGreaterThan(t.keys[i - 1]!.t);
      }
    }
  });
});

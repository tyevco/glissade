import { describe, expect, it } from 'vitest';
import { key, track, sampleTrack, UnresolvableTargetError, type Track, type Vec2 } from '../src/index.js';
import { morph, MorphError, type Box } from '../src/clips.js';

// non-trivial boxes: a small off-center chip growing into a large document
const chip: Box = { x: 80, y: 200, w: 120, h: 36 };
const doc: Box = { x: 320, y: 260, w: 480, h: 280 };

describe('morph — FLIP delta math', () => {
  it('position interpolates from-center → to-center', () => {
    const { tracks } = morph(chip, doc, { morphNode: 'fx' }, { at: 0.5, duration: 1.2 });
    const pos = tracks.find((t) => t.target === 'fx/position')!;
    expect(pos.type).toBe('vec2');
    expect(sampleTrack(pos, 0.5)).toEqual([80, 200]);
    expect(sampleTrack(pos, 0.5 + 1.2)).toEqual([320, 260]);
  });

  it('scale endpoints are from/base and to/base; [1,1] at the end when base omitted (= to)', () => {
    const { tracks } = morph(chip, doc, { morphNode: 'fx' }, { at: 0, duration: 1 });
    const scale = tracks.find((t) => t.target === 'fx/scale')!;
    expect(scale.type).toBe('vec2');
    // base defaults to `to`, so fromScale = chip/doc, toScale = [1,1]
    expect(sampleTrack(scale, 0)).toEqual([120 / 480, 36 / 280]);
    expect(sampleTrack(scale, 1)).toEqual([1, 1]);
  });

  it('an explicit base produces from/base and to/base scales', () => {
    const base = { w: 240, h: 60 };
    const { tracks } = morph(chip, doc, { morphNode: 'fx' }, { at: 0, duration: 1, base });
    const scale = tracks.find((t) => t.target === 'fx/scale')!;
    expect(sampleTrack(scale, 0)).toEqual([120 / 240, 36 / 60]);
    expect(sampleTrack(scale, 1)).toEqual([480 / 240, 280 / 60]);
  });
});

describe('morph — cross-fade timing', () => {
  it('fromNode fades 1→0 over duration*crossfade; toNode fades 0→1 starting at duration*(1-crossfade)', () => {
    const { tracks } = morph(
      chip,
      doc,
      { morphNode: 'fx', fromNode: 'chip', toNode: 'document' },
      { at: 1, duration: 2, crossfade: 0.25 },
    );
    const fromOp = tracks.find((t) => t.target === 'chip/opacity')!;
    const toOp = tracks.find((t) => t.target === 'document/opacity')!;
    // from: [1, 1 + 2*0.25] = [1, 1.5]
    expect(fromOp.keys.map((k) => [k.t, k.value])).toEqual([
      [1, 1],
      [1.5, 0],
    ]);
    // to: [1 + 2*(1-0.25), 1 + 2] = [2.5, 3]
    expect(toOp.keys.map((k) => [k.t, k.value])).toEqual([
      [2.5, 0],
      [3, 1],
    ]);
  });

  it('default crossfade is 0.5', () => {
    const { tracks } = morph(
      chip,
      doc,
      { morphNode: 'fx', fromNode: 'chip', toNode: 'document' },
      { at: 0, duration: 2 },
    );
    const fromOp = tracks.find((t) => t.target === 'chip/opacity')!;
    const toOp = tracks.find((t) => t.target === 'document/opacity')!;
    expect(fromOp.keys.map((k) => k.t)).toEqual([0, 1]);
    expect(toOp.keys.map((k) => k.t)).toEqual([1, 2]);
  });

  it('omits a from/to node opacity track when not supplied', () => {
    const { tracks } = morph(chip, doc, { morphNode: 'fx', fromNode: 'chip' }, { at: 0, duration: 1 });
    expect(tracks.map((t) => t.target).sort()).toEqual(['chip/opacity', 'fx/position', 'fx/scale']);
  });
});

describe('morph — deep-equal to hand-authored (byte-identity contract)', () => {
  it('emits exactly the four expected tracks', () => {
    const { tracks, end } = morph(
      chip,
      doc,
      { morphNode: 'fx', fromNode: 'chip', toNode: 'document' },
      { at: 0.5, duration: 1.2, ease: 'easeInOutCubic' },
    );

    const fromScale: Vec2 = [120 / 480, 36 / 280];
    const toScale: Vec2 = [1, 1];
    const hand: Track[] = [
      track('fx/position', 'vec2', [key(0.5, [80, 200] as Vec2), key(1.7, [320, 260] as Vec2, 'easeInOutCubic')]),
      track('fx/scale', 'vec2', [key(0.5, fromScale), key(1.7, toScale, 'easeInOutCubic')]),
      track('chip/opacity', 'number', [key(0.5, 1), key(1.1, 0, 'easeInOutCubic')]),
      track('document/opacity', 'number', [key(1.1, 0), key(1.7, 1, 'easeInOutCubic')]),
    ];

    expect(tracks).toEqual(hand);
    expect(end).toBe(1.7);
  });

  it('end === at + duration', () => {
    expect(morph(chip, doc, { morphNode: 'fx' }, { at: 3, duration: 0.4 }).end).toBeCloseTo(3.4, 10);
  });
});

describe('morph — value-type inference (no number-on-vec2 NaN)', () => {
  it('position/scale are vec2, opacities are number', () => {
    const { tracks } = morph(
      chip,
      doc,
      { morphNode: 'fx', fromNode: 'chip', toNode: 'document' },
      { at: 0, duration: 1 },
    );
    const byTarget = Object.fromEntries(tracks.map((t) => [t.target, t.type]));
    expect(byTarget['fx/position']).toBe('vec2');
    expect(byTarget['fx/scale']).toBe('vec2');
    expect(byTarget['chip/opacity']).toBe('number');
    expect(byTarget['document/opacity']).toBe('number');
    // a vec2 sample must never be NaN
    const pos = tracks.find((t) => t.target === 'fx/position')!;
    const mid = sampleTrack(pos, 0.5) as Vec2;
    expect(Number.isFinite(mid[0]) && Number.isFinite(mid[1])).toBe(true);
  });
});

describe('morph — rejections', () => {
  it('rejects a degenerate box (w<=0 / h<=0 / non-finite) with MorphError', () => {
    expect(() => morph({ x: 0, y: 0, w: 0, h: 10 }, doc, { morphNode: 'fx' }, { at: 0, duration: 1 })).toThrow(
      MorphError,
    );
    expect(() => morph(chip, { x: 0, y: 0, w: 10, h: -5 }, { morphNode: 'fx' }, { at: 0, duration: 1 })).toThrow(
      MorphError,
    );
    expect(() => morph({ x: 0, y: 0, w: NaN, h: 10 }, doc, { morphNode: 'fx' }, { at: 0, duration: 1 })).toThrow(
      MorphError,
    );
    expect(() =>
      morph({ x: Infinity, y: 0, w: 10, h: 10 }, doc, { morphNode: 'fx' }, { at: 0, duration: 1 }),
    ).toThrow(MorphError);
    // a degenerate explicit base is rejected too (would yield Infinity scale)
    expect(() => morph(chip, doc, { morphNode: 'fx' }, { at: 0, duration: 1, base: { w: 0, h: 60 } })).toThrow(
      MorphError,
    );
  });

  it('rejects duration <= 0', () => {
    expect(() => morph(chip, doc, { morphNode: 'fx' }, { at: 0, duration: 0 })).toThrow(MorphError);
    expect(() => morph(chip, doc, { morphNode: 'fx' }, { at: 0, duration: -1 })).toThrow(MorphError);
  });

  it('rejects crossfade outside [0,1]', () => {
    expect(() => morph(chip, doc, { morphNode: 'fx' }, { at: 0, duration: 1, crossfade: -0.1 })).toThrow(
      MorphError,
    );
    expect(() => morph(chip, doc, { morphNode: 'fx' }, { at: 0, duration: 1, crossfade: 1.5 })).toThrow(MorphError);
  });

  it('rejects a structural / anonymous target (free via resolveTweenTarget)', () => {
    expect(() => morph(chip, doc, { morphNode: '~Rect.0' }, { at: 0, duration: 1 })).toThrow(
      UnresolvableTargetError,
    );
  });
});

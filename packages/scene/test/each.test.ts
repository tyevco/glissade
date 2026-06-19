/**
 * `each()` — deterministic parametric instancing (0.13). Covers every seam the
 * feature contracts:
 *  - id generation: stable `${id}/${i}`, scene-indexable, dup/`~`/conflict reject
 *  - factory purity: a same-instance return throws
 *  - placement: byte-stable fractions (grid/row/ring), px-mapping via `box`
 *  - motion: deep-equals the clipList substrate (no drift), jitter reproducible
 *    and determinism-guard-clean, `end` correct
 *  - edges: n=0 empty, n=1 ring no-NaN
 */

import { describe, expect, it } from 'vitest';
import { clip, clipList, popIn, type ChannelOverride } from '@glissade/core/clips';
import { key } from '@glissade/core';
import { Rect } from '../src/nodes.js';
import { Node } from '../src/node.js';
import { createScene, DuplicateNodeIdError, ReservedNodeIdError } from '../src/scene.js';
import { each, EachError } from '../src/each.js';
import { withDeterminismGuards, DeterminismViolationError } from '../src/guards.js';

const card = (): Rect => new Rect({ width: 40, height: 40, fill: '#9ef0c0' });

describe('each — id generation', () => {
  it('stamps stable `${id}/${i}` ids in index order', () => {
    const r = each(3, card, { id: 'card', layout: { kind: 'row' } });
    expect(r.children.map((c) => c.id)).toEqual(['card/0', 'card/1', 'card/2']);
    expect(r.node.id).toBe('card');
    expect(r.node.children).toBe(r.children);
  });

  it('the wrapping group + generated ids index into a scene without throwing', () => {
    const r = each(4, card, { id: 'card', layout: { kind: 'grid', cols: 2 } });
    const scene = createScene({ size: { w: 100, h: 100 }, children: [r.node] });
    expect(scene.nodes.get('card')).toBe(r.node);
    expect(scene.nodes.get('card/3')).toBe(r.children[3]);
    // prop signals are addressable as clip.apply targets would have produced
    expect(scene.resolveTarget('card/2/opacity')).toBeDefined();
  });

  it('a clone id colliding with a hand-authored node throws DuplicateNodeIdError', () => {
    const r = each(2, card, { id: 'card', layout: { kind: 'row' } });
    const dup = new Rect({ id: 'card/1', width: 1, height: 1 });
    expect(() => createScene({ size: { w: 10, h: 10 }, children: [r.node, dup] })).toThrow(DuplicateNodeIdError);
  });

  it('a `~`-prefixed opts.id surfaces as a ReservedNodeIdError at scene assembly', () => {
    const r = each(1, card, { id: '~card', layout: { kind: 'row' } });
    expect(() => createScene({ size: { w: 10, h: 10 }, children: [r.node] })).toThrow(ReservedNodeIdError);
  });

  it('rejects a factory that sets a conflicting id', () => {
    expect(() =>
      each(2, (i) => new Rect({ ...(i === 1 ? { id: 'mine' } : {}), width: 1, height: 1 }), {
        id: 'card',
        layout: { kind: 'row' },
      }),
    ).toThrow(EachError);
  });

  it('accepts a factory that sets the MATCHING id (idempotent)', () => {
    const r = each(2, (i, ctx) => new Rect({ id: ctx.id, width: 1, height: 1 }), {
      id: 'card',
      layout: { kind: 'row' },
    });
    expect(r.children.map((c) => c.id)).toEqual(['card/0', 'card/1']);
  });
});

describe('each — factory purity', () => {
  it('throws when the factory returns the same Node instance twice', () => {
    const shared = card();
    expect(() => each(2, () => shared, { id: 'card', layout: { kind: 'row' } })).toThrow(EachError);
  });

  it('throws when the factory returns a non-Node', () => {
    expect(() => each(1, () => ({} as unknown as Node), { id: 'card', layout: { kind: 'row' } })).toThrow(EachError);
  });
});

describe('each — placement (byte-stable fractions)', () => {
  it('grid 3×3 lays out a regular fraction grid', () => {
    const r = each(9, card, { id: 'g', layout: { kind: 'grid', cols: 3 } });
    const frac = r.places.map((p) => p.frac);
    expect(frac).toEqual([
      [0, 0], [0.5, 0], [1, 0],
      [0, 0.5], [0.5, 0.5], [1, 0.5],
      [0, 1], [0.5, 1], [1, 1],
    ]);
  });

  it('row centres a default-gapped run with align at mid-height', () => {
    const r = each(3, card, { id: 'r', layout: { kind: 'row' } });
    expect(r.places.map((p) => p.frac)).toEqual([
      [0, 0.5], [0.5, 0.5], [1, 0.5],
    ]);
  });

  it('ring places clones around a full sweep using i/n (seamless)', () => {
    const r = each(4, card, { id: 'k', layout: { kind: 'ring', radius: 0.5, startAngle: 0, sweep: Math.PI * 2 } });
    const frac = r.places.map((p) => p.frac.map((v) => Number(v.toFixed(6))));
    expect(frac).toEqual([
      [1, 0.5],   // theta 0
      [0.5, 1],   // theta pi/2
      [0, 0.5],   // theta pi
      [0.5, 0],   // theta 3pi/2
    ]);
  });

  it('maps fractions to px when a box is given', () => {
    const r = each(3, card, { id: 'r', layout: { kind: 'row' }, box: { w: 600, h: 360 } });
    expect(r.places.map((p) => p.px)).toEqual([
      [0, 180], [300, 180], [600, 180],
    ]);
  });

  it('is run-stable (re-run → deep-equal places)', () => {
    const a = each(9, card, { id: 'g', layout: { kind: 'grid', cols: 3 }, box: { w: 100, h: 100 } });
    const b = each(9, card, { id: 'g', layout: { kind: 'grid', cols: 3 }, box: { w: 100, h: 100 } });
    expect(a.places).toEqual(b.places);
  });
});

describe('each — staggered motion', () => {
  const ids = ['card/0', 'card/1', 'card/2', 'card/3'];

  it('deep-equals the clipList substrate (no drift)', () => {
    const c = popIn();
    const got = each(4, card, {
      id: 'card',
      layout: { kind: 'row' },
      motion: { clip: c, startSec: 0, stagger: 0.08 },
    });
    const want = clipList(c, ids, 0, { stagger: 0.08 });
    expect(got.tracks).toEqual(want.tracks);
    expect(got.end).toBeCloseTo(want.end, 10);
  });

  it('distribute:from-center compiles to abs(i-mid)*gap delays', () => {
    const c = popIn();
    const got = each(4, card, {
      id: 'card',
      layout: { kind: 'row' },
      motion: { clip: c, stagger: 0.1, distribute: 'from-center' },
    });
    // mid = 1.5 → delays [1.5,0.5,0.5,1.5]*0.1 = [0.15,0.05,0.05,0.15]
    const want = clipList(c, ids, 0, { stagger: (i) => Math.abs(i - 1.5) * 0.1 });
    expect(got.tracks).toEqual(want.tracks);
  });

  it('end is the max child clip end', () => {
    const c = popIn({ duration: 0.3 });
    const got = each(3, card, { id: 'card', layout: { kind: 'row' }, motion: { clip: c, stagger: 0.2 } });
    // last child starts at 0.4, ends at 0.7
    expect(got.end).toBeCloseTo(0.7, 10);
  });
});

describe('each — jitter determinism', () => {
  const jitter = (_i: number, rng: () => number): Record<string, ChannelOverride> => ({
    opacity: { to: 0.5 + rng() * 0.5 },
  });

  it('is reproducible with a fixed seed (re-run → deep-equal)', () => {
    const c = popIn();
    const a = each(5, card, { id: 'card', layout: { kind: 'row' }, seed: 7, motion: { clip: c, jitter } });
    const b = each(5, card, { id: 'card', layout: { kind: 'row' }, seed: 7, motion: { clip: c, jitter } });
    expect(a.tracks).toEqual(b.tracks);
  });

  it('different seeds give different jitter', () => {
    const c = popIn();
    const a = each(5, card, { id: 'card', layout: { kind: 'row' }, seed: 1, motion: { clip: c, jitter } });
    const b = each(5, card, { id: 'card', layout: { kind: 'row' }, seed: 2, motion: { clip: c, jitter } });
    expect(a.tracks).not.toEqual(b.tracks);
  });

  it('builds clean under withDeterminismGuards (seeded RNG, no banned globals)', () => {
    const c = popIn();
    const build = (): ReturnType<typeof each> =>
      each(5, card, { id: 'card', layout: { kind: 'row' }, seed: 7, motion: { clip: c, jitter } });
    expect(() => withDeterminismGuards('throw', build)).not.toThrow(DeterminismViolationError);
    expect(withDeterminismGuards('throw', build).tracks).toEqual(build().tracks);
  });
});

describe('each — edge cases', () => {
  it('n=0 → empty group, no children, no tracks', () => {
    const r = each(0, card, { id: 'card', layout: { kind: 'row' }, motion: { clip: popIn(), stagger: 0.1 } });
    expect(r.children).toEqual([]);
    expect(r.node.children).toEqual([]);
    expect(r.tracks).toEqual([]);
    expect(r.places).toEqual([]);
    expect(r.end).toBe(0);
  });

  it('n=1 ring produces a finite (non-NaN) placement', () => {
    const r = each(1, card, { id: 'card', layout: { kind: 'ring' } });
    const [fx, fy] = r.places[0]!.frac;
    expect(Number.isFinite(fx)).toBe(true);
    expect(Number.isFinite(fy)).toBe(true);
  });

  it('rejects a negative / non-integer count', () => {
    expect(() => each(-1, card, { id: 'card', layout: { kind: 'row' } })).toThrow(EachError);
    expect(() => each(2.5, card, { id: 'card', layout: { kind: 'row' } })).toThrow(EachError);
  });

  it('defaults the seed to a stable hash of id (no opts.seed)', () => {
    const c = clip({ channels: { o: { path: 'opacity', keys: [key(0, 0), key(0.3, 1)] } } });
    const jit = (_i: number, rng: () => number): Record<string, ChannelOverride> => ({ o: { to: rng() } });
    const a = each(3, card, { id: 'card', layout: { kind: 'row' }, motion: { clip: c, jitter: jit } });
    const b = each(3, card, { id: 'card', layout: { kind: 'row' }, motion: { clip: c, jitter: jit } });
    expect(a.tracks).toEqual(b.tracks);
  });
});

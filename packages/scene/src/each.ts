/**
 * `each()` — deterministic parametric instancing (0.13 clip-tier sugar). Pure
 * BUILD-TIME fan-out: it generates N scene nodes from a factory, lays them out
 * in aspect-fraction space, and (optionally) staggers a motion `clip` across
 * them — compiling to ordinary keyed `Track[]` plus a `Group` of children with
 * stable `${id}/${i}` ids. Nothing executes at play time; the emitted tracks are
 * byte-indistinguishable from hand-authored ones, so goldens hold by
 * construction and every `--workers` export shard reconstructs the same id set.
 *
 * The clip runtime is imported TYPE-ONLY (the `Clip` instance the author passes
 * carries its own `apply`), so `each` adds no clip bytes to the embed: the
 * `@glissade/core/clips` runtime lands in the consumer's bundle, never scene's.
 */

import { random, type Rng, type Track } from '@glissade/core';
// TYPE-ONLY (verified by check:size): the clip runtime must NOT enter the embed.
import type { ApplyOpts, ChannelOverride, Clip } from '@glissade/core/clips';
import { Group } from './nodes.js';
import { Node } from './node.js';
import { hashStr } from './sketch.js';

/** An aspect-fraction placement: [fx, fy], each conventionally in [0, 1]. */
export type Place = readonly [number, number];

/**
 * Built-in layouts (a discriminated union — NOT factory fns) plus the escape
 * hatch `(i, n) => [fx, fy]`. Every built-in is PURE arithmetic in aspect
 * fractions; mapping to px happens only when `box` is given (see `places`).
 */
export type EachLayout =
  | { kind: 'row'; gap?: number; align?: number }
  | { kind: 'column'; gap?: number; align?: number }
  | { kind: 'grid'; cols: number; rows?: number; gapX?: number; gapY?: number; order?: 'row' | 'column' }
  | { kind: 'ring'; radius?: number; center?: Place; startAngle?: number; sweep?: number }
  | ((i: number, n: number) => Place);

/** How a `stagger` delay distributes across the clones. */
export type EachDistribute = 'delay' | 'from-center' | 'from-edges';

/** Per-index motion: a clip fanned across the clones with stagger + jitter. */
export interface EachMotion {
  /** The motion clip applied to every clone (TYPE: `Clip` from core/clips). */
  clip: Clip;
  /** Wall-clock start second of the first clone. Default 0. */
  startSec?: number;
  /** Per-index delay (seconds) or a function of the index. Default 0. */
  stagger?: number | ((i: number) => number);
  /**
   * Shape a numeric `stagger` gap into a distribution. `from-center` ramps the
   * delay outward from the middle clone, `from-edges` inward toward it; `delay`
   * (the default) is the plain `i * gap` ramp. Ignored when `stagger` is a fn.
   */
  distribute?: EachDistribute;
  /** Per-index clip overrides, seeded — `(i, rng, n) => overrides`. */
  jitter?: (i: number, rng: Rng, n: number) => Record<string, ChannelOverride>;
  /** Clip speed (passed straight to `clip.apply`). */
  speed?: number;
}

/** Pixel box for mapping aspect-fraction places to a concrete coordinate frame. */
export interface EachBox {
  w: number;
  h: number;
  /** Top-left of the box in scene coords; default [0, 0]. */
  origin?: Place;
}

export interface EachOpts {
  /** Stable id prefix; clones are `${id}/${i}`, the wrapping group is `${id}`. */
  id: string;
  layout: EachLayout;
  motion?: EachMotion;
  /** Seed for per-clone RNG; defaults to a stable hash of `id`. */
  seed?: number;
  /** When given, `places` also carries the px-mapped points (see EachResult). */
  box?: EachBox;
}

/** The per-clone authoring context handed to the factory. */
export interface EachContext {
  /** Clone index, 0..n-1. */
  i: number;
  /** Total clone count. */
  n: number;
  /** This clone's id (`${opts.id}/${i}`). */
  id: string;
  /** Aspect-fraction placement [fx, fy] — ALWAYS a fraction (px is separate). */
  place: Place;
  /** Seeded generator for this clone: `random(mix(seed, i))`. */
  rng: Rng;
  /** The resolved base seed (`opts.seed ?? hash(id)`). */
  seed: number;
}

export interface EachResult {
  /** The wrapping group (`id: opts.id`) holding every generated child. */
  node: Group;
  /** The generated children, in index order. */
  children: Node[];
  /** The compiled motion tracks (empty when no `motion`). */
  tracks: Track[];
  /** Max child clip end (== startSec when no motion). */
  end: number;
  /**
   * Per-clone placement. `frac` is the aspect-fraction [fx, fy] every layout
   * produces; `px` is present only when `opts.box` was given (frac mapped into
   * the box). Authoring a `box` once here is the single place fraction→px lives.
   */
  places: { frac: Place; px?: Place }[];
}

export class EachError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EachError';
  }
}

/**
 * Fold a base seed and an index into a fresh per-clone seed. splitmix-style
 * avalanche so adjacent indices decorrelate (a bare `seed + i` would hand
 * near-identical streams to neighbours).
 */
function mix(seed: number, i: number): number {
  let h = (seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * Salt folded into the motion-jitter seed so the per-index jitter rng
 * decorrelates from `ctx.rng` (the factory rng). Both axes derive from
 * `mix(baseSeed, i)`; without a distinct salt they would be the SAME stream,
 * so a factory that draws from `ctx.rng` and a `jitter` callback would see
 * correlated "independent" randomness. An arbitrary fixed odd constant.
 */
const JITTER_SALT = 0x6a09e667;

/** Resolve a built-in layout (or call the escape-hatch fn) to a fraction. */
function placeAt(layout: EachLayout, i: number, n: number): Place {
  if (typeof layout === 'function') return layout(i, n);
  switch (layout.kind) {
    case 'row': {
      const gap = layout.gap ?? (n > 1 ? 1 / (n - 1) : 0);
      const align = layout.align ?? 0.5;
      // centred run of width gap*(n-1), pinned vertically at `align`
      const span = gap * (n - 1);
      const x0 = 0.5 - span / 2;
      return [n === 1 ? 0.5 : x0 + gap * i, align];
    }
    case 'column': {
      const gap = layout.gap ?? (n > 1 ? 1 / (n - 1) : 0);
      const align = layout.align ?? 0.5;
      const span = gap * (n - 1);
      const y0 = 0.5 - span / 2;
      return [align, n === 1 ? 0.5 : y0 + gap * i];
    }
    case 'grid': {
      const cols = layout.cols;
      if (!(cols >= 1)) throw new EachError(`grid layout needs cols >= 1 (got ${cols})`);
      const rows = layout.rows ?? Math.ceil(n / cols);
      const order = layout.order ?? 'row';
      const col = order === 'row' ? i % cols : Math.floor(i / rows);
      const row = order === 'row' ? Math.floor(i / cols) : i % rows;
      const gapX = layout.gapX ?? (cols > 1 ? 1 / (cols - 1) : 0);
      const gapY = layout.gapY ?? (rows > 1 ? 1 / (rows - 1) : 0);
      const spanX = gapX * (cols - 1);
      const spanY = gapY * (rows - 1);
      const fx = cols === 1 ? 0.5 : 0.5 - spanX / 2 + gapX * col;
      const fy = rows === 1 ? 0.5 : 0.5 - spanY / 2 + gapY * row;
      return [fx, fy];
    }
    case 'ring': {
      const radius = layout.radius ?? 0.5;
      const [cx, cy] = layout.center ?? [0.5, 0.5];
      const startAngle = layout.startAngle ?? -Math.PI / 2;
      const sweep = layout.sweep ?? Math.PI * 2;
      // i/n (NOT i/(n-1)) so a full sweep is seamless and n=1 never divides by 0
      const theta = startAngle + sweep * (n === 0 ? 0 : i / n);
      return [cx + radius * Math.cos(theta), cy + radius * Math.sin(theta)];
    }
  }
}

/** Compile a `distribute` mode + numeric gap into a stagger delay fn. */
function distributeFn(
  distribute: EachDistribute,
  gap: number,
  n: number,
): (i: number) => number {
  const mid = (n - 1) / 2;
  switch (distribute) {
    case 'from-center':
      return (i) => Math.abs(i - mid) * gap;
    case 'from-edges':
      return (i) => (mid - Math.abs(i - mid)) * gap;
    case 'delay':
      return (i) => i * gap;
  }
}

/** Resolve the motion's per-index delay into a plain `(i) => seconds` fn. */
function staggerFn(motion: EachMotion, n: number): (i: number) => number {
  const s = motion.stagger ?? 0;
  if (typeof s === 'function') return s;
  return distributeFn(motion.distribute ?? 'delay', s, n);
}

/**
 * Generate `n` clones from `factory`, lay them out, and (optionally) stagger a
 * motion clip across them.
 *
 *   const grid = each(9, (i) => new Rect({ width: 40, height: 40, fill: '#9ef0c0' }), {
 *     id: 'card',
 *     layout: { kind: 'grid', cols: 3 },
 *     box: { w: 600, h: 360 },
 *     motion: { clip: popIn(), stagger: 0.08, distribute: 'from-center' },
 *   });
 *   // scene children: [grid.node]; timeline tracks: [...grid.tracks]
 */
export function each(
  n: number,
  factory: (i: number, ctx: EachContext) => Node,
  opts: EachOpts,
): EachResult {
  if (!Number.isInteger(n) || n < 0) throw new EachError(`each() count must be a non-negative integer (got ${n})`);
  const baseSeed = (opts.seed ?? hashStr(opts.id)) >>> 0;
  const box = opts.box;
  const [ox, oy] = box?.origin ?? [0, 0];

  const children: Node[] = [];
  const places: { frac: Place; px?: Place }[] = [];
  const seen = new Set<Node>();

  for (let i = 0; i < n; i++) {
    const id = `${opts.id}/${i}`;
    const frac = placeAt(opts.layout, i, n);
    const ctx: EachContext = { i, n, id, place: frac, rng: random(mix(baseSeed, i)), seed: baseSeed };
    const child = factory(i, ctx);
    if (!(child instanceof Node)) {
      throw new EachError(`each() factory must return a Node for index ${i} (got ${typeof child})`);
    }
    // cheap factory-purity defense: a pure factory returns a FRESH node each call
    if (seen.has(child)) {
      throw new EachError(
        `each() factory returned the same Node instance for index ${i} — the factory must construct a new node per index (it is called once per clone)`,
      );
    }
    seen.add(child);
    // stamp the structural id if the factory left it unset; reject a conflict
    if (child.id === undefined) {
      (child as { id: string | undefined }).id = id;
    } else if (child.id !== id) {
      throw new EachError(
        `each() factory set id '${child.id}' on index ${i}, but each owns the id namespace — leave it unset so it becomes '${id}'`,
      );
    }
    children.push(child);
    places.push(box ? { frac, px: [ox + frac[0] * box.w, oy + frac[1] * box.h] } : { frac });
  }

  const node = new Group({ id: opts.id, children });

  const tracks: Track[] = [];
  let end = opts.motion?.startSec ?? 0;
  if (opts.motion) {
    const m = opts.motion;
    const start = m.startSec ?? 0;
    const at = staggerFn(m, n);
    for (let i = 0; i < n; i++) {
      // salt the jitter seed so it decorrelates from ctx.rng (both otherwise
      // derive from mix(baseSeed, i) — the same stream).
      const rngI = random(mix(mix(baseSeed, i), JITTER_SALT));
      const overrides = m.jitter?.(i, rngI, n);
      const applyOpts: ApplyOpts = {
        ...(overrides !== undefined ? { overrides } : {}),
        ...(m.speed !== undefined ? { speed: m.speed } : {}),
      };
      const r = m.clip.apply(`${opts.id}/${i}`, start + at(i), applyOpts);
      tracks.push(...r.tracks);
      if (r.end > end) end = r.end;
    }
  }

  return { node, children, tracks, end, places };
}

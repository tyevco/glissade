/**
 * `particles()` (0.57) — a small, seeded, baked particle emitter. It is a COMPOSE
 * of two already-shipped primitives, NOT new engine code:
 *
 *   - `each()`  makes `count` fixed slot nodes at stable ids `${id}/${i}` (the
 *     appearance layer — a themed dot/glyph per slot, with a seeded per-slot rng).
 *   - `bake()`  simulates the seeded physics ONCE at a fixed dt and emits ordinary
 *     frame-indexed position/opacity/(scale/rotation) Tracks targeting those SAME
 *     slot ids.
 *
 * Every slot → a real node → real tracks → a real exportable Lottie layer:
 * interchange is faithful BY CONSTRUCTION (there is no render-only / custom-draw
 * path to silently drop — the 0.55 camera/echo trap avoided up front). Because
 * bake reseeds its rng fresh per call and never touches Date/Math.random, the
 * emitted tracks are byte-identical run-to-run and the goldens hold by
 * construction; a DIFFERENT seed genuinely varies the output.
 *
 * `count` is the MAX-CONCURRENT live-particle pool size, NOT total emitted. Slots
 * are a deterministic RING BUFFER: the emitIndex-th particle lands in slot
 * `emitIndex % count`, reuse overwriting the oldest. A slot is opacity-0 before
 * its particle's emit time and after its lifetime ends, and any slot that is
 * opacity-0 for the ENTIRE sim window is PRUNED from the output — so a low-density
 * drift exports a layer count proportional to its live particles, not `count`
 * near-empty layers.
 *
 * Baked-only (v1): there is no GPU / unbounded / render-only mode. `count` is hard-
 * capped at {@link MAX_PARTICLE_COUNT}; going over THROWS (never a silent clamp).
 *
 * Lives on `@glissade/scene/motion` (off the sacred base embed), factory-no-`new`.
 */

import { bake, type Rng, type Track } from '@glissade/core';
import { each, type Place } from './each.js';
import { Node } from './node.js';
import { Circle, Group, Text } from './nodes.js';
import { hashStr } from './sketch.js';

/** Hard cap on the slot pool. `count` over this THROWS (never silent-clamps). */
export const MAX_PARTICLE_COUNT = 200;

const DEG = Math.PI / 180;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/** A life-fraction curve: `u` in [0,1] (age/lifetime) → a scalar (opacity/scale). */
export type OverLife = (u: number) => number;

/** A spawn area spread around the origin (px), for scattering (drift) vs a point (sparks). */
export type AreaSpec =
  | { kind: 'box'; w: number; h: number }
  | { kind: 'disc'; radius: number };

/** Constant accelerations folded into the per-step integration. */
export interface ParticleForces {
  /** px/s², applied on +y (down). */
  gravity?: number;
  /** velocity damping coefficient (1/s): `v -= v*drag*dt`. */
  drag?: number;
  /** px/s² wind acceleration `[ax, ay]`. */
  wind?: readonly [number, number];
}

/** The mutable per-particle physics state (also what the `step` escape-hatch mutates). */
export interface ParticleState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** rotation, degrees. */
  rot: number;
  /** angular velocity, deg/s. */
  spin: number;
  /** seconds since emit. */
  age: number;
  /** this particle's lifetime, seconds. */
  life: number;
}

/** The per-slot authoring context handed to `appearance`. */
export interface ParticleAppearanceContext {
  /** Slot index, 0..count-1. */
  i: number;
  /** Slot pool size (== count). */
  n: number;
  /** Seeded per-slot generator (`each`'s `random(mix(seed, i))`). */
  rng: Rng;
  /** The resolved base seed. */
  seed: number;
}

/**
 * The appearance of one slot: a node, optionally with per-slot over-life curves
 * (which override the spec-level defaults). The escape hatch — any Node subtree
 * (a themed dot, a glyph Text, a small Group) works.
 */
export interface ParticleAppearance {
  node: Node;
  opacityOverLife?: OverLife;
  scaleOverLife?: OverLife;
}

export interface ParticleSpec {
  /** Stable id prefix — slots are `${id}/${i}`, the wrapping group is `${id}`. */
  id: string;
  /** MAX-CONCURRENT live-particle pool size (ring buffer). Bounded by MAX_PARTICLE_COUNT. */
  count: number;
  /** Seed for the physics rng; defaults to a stable `hashStr(id)`. Reseeded per call. */
  seed?: number;
  /** The pixel frame the RELATIVE origin resolves against (typically the scene size). */
  box: { w: number; h: number };
  /** Continuous emission (particles/sec). Supply this and/or `burst`. */
  rate?: number;
  /** Instantaneous emission — `n` particles at t=0, or timed bursts. */
  burst?: number | readonly { at: number; n: number }[];
  /** Per-particle lifetime, seconds — a scalar or a `[min,max]` range. */
  lifetime: number | readonly [number, number];
  /** Total sim seconds (the bake duration). */
  duration: number;
  /** Bake frame grid (match the render fps). */
  fps: number;
  /** Spawn point in RELATIVE viewport coords ([0.5,0.5]=center), resolved against `box`. */
  origin: Place;
  /** Optional spread around the origin (px). */
  area?: AreaSpec;
  /**
   * Safe-area clamp (0.57.1): no particle spawns BELOW this RELATIVE Y (`safeBottom *
   * box.h`), so ambient motes never drift into a lower-third caption band. Relative
   * [0,1] — NOT a pixel Y. Must sit at/below the spawn band's top (a `safeBottom` above
   * the band top leaves no valid spawn region → throws). The framework can't know a
   * consumer's captionTop, so this is the opt-in PRECISE clamp; the `drift` preset also
   * ships a conservative DEFAULT band that clears a standard lower-third by itself.
   */
  safeBottom?: number;
  /** Polar initial velocity — `speed` px/s, `angle` degrees (0 = +x / right). */
  velocity: { speed: readonly [number, number]; angle: readonly [number, number] };
  /** Constant forces. */
  forces?: ParticleForces;
  /** Optional angular-velocity range (deg/s) — emits a rotation channel when present. */
  spin?: readonly [number, number];
  /** Slot appearance — a Node, or `{ node, opacityOverLife?, scaleOverLife? }`. Escape hatch. */
  appearance: (i: number, ctx: ParticleAppearanceContext) => Node | ParticleAppearance;
  /** Spec-level opacity-over-life default (per-slot appearance wins). */
  opacityOverLife?: OverLife;
  /** Spec-level scale-over-life default — emits a scale channel when present. */
  scaleOverLife?: OverLife;
  /** ESCAPE HATCH: replace the built-in force integration with a raw per-particle step. */
  step?: (p: ParticleState, dt: number, rng: Rng) => void;
}

export interface ParticlesResult {
  /** The wrapping group (`id`) holding every VISIBLE slot node. Draw THIS. */
  node: Group;
  /** The baked position/opacity/(scale/rotation) tracks — inject with `tl.tracks(...)`. */
  tracks: Track[];
  /** The sim end (== duration). */
  end: number;
}

/** Thrown for a mis-built emitter (fail loud, never a silent no-op / clamp). */
export class ParticleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParticleError';
  }
}

/** The default gentle fade: ramp in, hold at `peak`, ramp out. */
function fadeCurve(peak: number, fin: number, fout: number): OverLife {
  return (u) => {
    if (u < fin) return peak * (u / fin);
    if (u > 1 - fout) return peak * ((1 - u) / fout);
    return peak;
  };
}

const DEFAULT_OPACITY = fadeCurve(1, 0.15, 0.3);

function assertFiniteNum(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ParticleError(`particles(): ${what} must be a finite number (got ${String(v)}).`);
  }
  return v;
}

function assertPositiveRange(r: readonly [number, number], what: string): void {
  assertFiniteNum(r[0], `${what}[0]`);
  assertFiniteNum(r[1], `${what}[1]`);
}

/** Extract a Node + optional per-slot curves from an `appearance` return, or throw. */
function normalizeAppearance(raw: Node | ParticleAppearance, i: number): ParticleAppearance {
  if (raw instanceof Node) return { node: raw };
  if (raw != null && typeof raw === 'object' && (raw as ParticleAppearance).node instanceof Node) {
    return raw as ParticleAppearance;
  }
  throw new ParticleError(
    `particles(): appearance(${i}) must return a Node (or { node: Node, opacityOverLife?, scaleOverLife? }) — got ${typeof raw}.`,
  );
}

/** Build the sorted emission-time schedule (one entry per particle, in emit order). */
function buildEmitTimes(spec: ParticleSpec): number[] {
  const times: number[] = [];
  if (spec.burst !== undefined) {
    if (typeof spec.burst === 'number') {
      const n = spec.burst;
      if (!Number.isInteger(n) || n < 1) {
        throw new ParticleError(`particles(): burst count must be a positive integer (got ${String(n)}).`);
      }
      for (let k = 0; k < n; k++) times.push(0);
    } else {
      for (const b of spec.burst) {
        assertFiniteNum(b?.at, 'burst.at');
        if (!Number.isInteger(b.n) || b.n < 1) {
          throw new ParticleError(`particles(): burst.n must be a positive integer (got ${String(b?.n)}).`);
        }
        if (b.at < 0) throw new ParticleError(`particles(): burst.at must be >= 0 (got ${b.at}).`);
        for (let k = 0; k < b.n; k++) times.push(b.at);
      }
    }
  }
  if (spec.rate !== undefined) {
    const rate = spec.rate;
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new ParticleError(`particles(): rate must be a finite number > 0 (got ${String(rate)}).`);
    }
    for (let k = 0; k / rate < spec.duration; k++) times.push(k / rate);
  }
  times.sort((a, b) => a - b);
  return times;
}

export function particles(spec: ParticleSpec): ParticlesResult {
  // ── fail-loud validation cluster ──────────────────────────────────────────
  if (typeof spec.id !== 'string' || spec.id.length === 0) {
    throw new ParticleError('particles(): id must be a non-empty string (slots bind tracks against `${id}/${i}`).');
  }
  const { count } = spec;
  if (!Number.isInteger(count) || count <= 0) {
    throw new ParticleError(`particles(): count must be a positive integer (got ${String(count)}).`);
  }
  if (count > MAX_PARTICLE_COUNT) {
    throw new ParticleError(`particles(): count ${count} exceeds max ${MAX_PARTICLE_COUNT}.`);
  }
  const seed = (spec.seed ?? hashStr(spec.id)) >>> 0;
  if (spec.seed !== undefined && !Number.isFinite(spec.seed)) {
    throw new ParticleError(`particles(): seed must be a finite number (got ${String(spec.seed)}).`);
  }
  if (!Number.isFinite(spec.duration) || spec.duration <= 0) {
    throw new ParticleError(`particles(): duration must be a finite number > 0 (got ${String(spec.duration)}).`);
  }
  if (!Number.isFinite(spec.fps) || spec.fps <= 0) {
    throw new ParticleError(`particles(): fps must be a finite number > 0 (got ${String(spec.fps)}).`);
  }
  if (spec.rate === undefined && spec.burst === undefined) {
    throw new ParticleError('particles(): supply `rate` and/or `burst` — an emitter with neither emits nothing.');
  }
  if (!spec.box || !(spec.box.w > 0) || !(spec.box.h > 0)) {
    throw new ParticleError(`particles(): box must be { w > 0, h > 0 } (got ${JSON.stringify(spec.box)}).`);
  }
  if (!Array.isArray(spec.origin) || spec.origin.length !== 2) {
    throw new ParticleError('particles(): origin must be a relative [fx, fy] place.');
  }
  assertFiniteNum(spec.origin[0], 'origin[0]');
  assertFiniteNum(spec.origin[1], 'origin[1]');
  if (typeof spec.appearance !== 'function') {
    throw new ParticleError('particles(): appearance must be a function (i, ctx) => Node | { node, ... }.');
  }
  // lifetime
  const lifeIsRange = Array.isArray(spec.lifetime);
  if (lifeIsRange) {
    const r = spec.lifetime as readonly [number, number];
    assertPositiveRange(r, 'lifetime');
    if (r[0] <= 0 || r[1] <= 0) throw new ParticleError(`particles(): lifetime range must be > 0 (got ${JSON.stringify(r)}).`);
  } else {
    const l = assertFiniteNum(spec.lifetime, 'lifetime');
    if (l <= 0) throw new ParticleError(`particles(): lifetime must be > 0 (got ${l}).`);
  }
  assertPositiveRange(spec.velocity.speed, 'velocity.speed');
  assertPositiveRange(spec.velocity.angle, 'velocity.angle');
  if (spec.spin !== undefined) assertPositiveRange(spec.spin, 'spin');
  if (spec.area?.kind === 'box') {
    assertFiniteNum(spec.area.w, 'area.w');
    assertFiniteNum(spec.area.h, 'area.h');
  } else if (spec.area?.kind === 'disc') {
    assertFiniteNum(spec.area.radius, 'area.radius');
  }
  // safe-area clamp (0.57.1): relative [0,1], and it must sit at/below the spawn band
  // TOP (else every spawn collapses above it → no valid region). Fail loud on all three.
  if (spec.safeBottom !== undefined) {
    const sb = assertFiniteNum(spec.safeBottom, 'safeBottom');
    if (sb < 0 || sb > 1) {
      throw new ParticleError(
        `particles(): safeBottom must be a RELATIVE fraction in [0,1] (got ${sb}) — it is safeBottom*box.h, not a pixel Y (did you pass a captionTop in px?).`,
      );
    }
    const areaHalfHRel =
      spec.area?.kind === 'box' ? spec.area.h / 2 / spec.box.h
      : spec.area?.kind === 'disc' ? spec.area.radius / spec.box.h
      : 0;
    const bandTopRel = spec.origin[1] - areaHalfHRel;
    if (sb < bandTopRel) {
      throw new ParticleError(
        `particles(): safeBottom ${sb} is above the spawn band top (${bandTopRel.toFixed(3)}) — no valid spawn region (raise safeBottom, or lower the origin/shrink the area).`,
      );
    }
  }

  const emitTimes = buildEmitTimes(spec);

  // ── build the count slot nodes via each() (id namespace + per-slot rng) ─────
  const opacityCurves: OverLife[] = new Array<OverLife>(count);
  const scaleCurves: (OverLife | undefined)[] = new Array<OverLife | undefined>(count);
  const built = each(
    count,
    (i, ctx) => {
      const ap = normalizeAppearance(spec.appearance(i, { i, n: count, rng: ctx.rng, seed: ctx.seed }), i);
      opacityCurves[i] = ap.opacityOverLife ?? spec.opacityOverLife ?? DEFAULT_OPACITY;
      scaleCurves[i] = ap.scaleOverLife ?? spec.scaleOverLife;
      return ap.node;
    },
    { id: spec.id, layout: (): Place => [0, 0], seed },
  );

  const emitScale = scaleCurves.some((c) => c !== undefined) || spec.scaleOverLife !== undefined;
  const emitRot = spec.spin !== undefined;
  const slotId = (i: number): string => `${spec.id}/${i}`;

  // ── the simulation world ───────────────────────────────────────────────────
  interface World {
    frame: number;
    next: number; // index of the next particle to emit
    slots: ParticleState[];
    alive: boolean[];
  }

  const [vsMin, vsMax] = spec.velocity.speed;
  const [vaMin, vaMax] = spec.velocity.angle;
  const spinMin = spec.spin?.[0] ?? 0;
  const spinMax = spec.spin?.[1] ?? 0;
  const gravity = spec.forces?.gravity ?? 0;
  const drag = spec.forces?.drag ?? 0;
  const [windX, windY] = spec.forces?.wind ?? [0, 0];
  const ox = spec.origin[0] * spec.box.w;
  const oy = spec.origin[1] * spec.box.h;
  const area = spec.area;
  const safeBottomPx = spec.safeBottom !== undefined ? spec.safeBottom * spec.box.h : undefined;

  const emitDue = (w: World, rng: Rng): void => {
    const t = w.frame / spec.fps;
    while (w.next < emitTimes.length && emitTimes[w.next]! <= t + 1e-9) {
      const e = w.next++;
      const slot = e % count;
      const s = w.slots[slot]!;
      const speed = lerp(vsMin, vsMax, rng());
      const ang = lerp(vaMin, vaMax, rng()) * DEG;
      s.vx = Math.cos(ang) * speed;
      s.vy = Math.sin(ang) * speed;
      s.life = lifeIsRange
        ? lerp((spec.lifetime as readonly [number, number])[0], (spec.lifetime as readonly [number, number])[1], rng())
        : (spec.lifetime as number);
      let px = ox;
      let py = oy;
      if (area?.kind === 'box') {
        px += (rng() * 2 - 1) * (area.w / 2);
        py += (rng() * 2 - 1) * (area.h / 2);
      } else if (area?.kind === 'disc') {
        const rr = area.radius * Math.sqrt(rng());
        const th = rng() * Math.PI * 2;
        px += Math.cos(th) * rr;
        py += Math.sin(th) * rr;
      }
      // safe-area clamp: never spawn below the safe line (motes drift up from here).
      if (safeBottomPx !== undefined && py > safeBottomPx) py = safeBottomPx;
      s.x = px;
      s.y = py;
      s.rot = 0;
      s.spin = emitRot ? lerp(spinMin, spinMax, rng()) : 0;
      s.age = 0;
      w.alive[slot] = true;
    }
  };

  const bakeCfg = {
    duration: spec.duration,
    fps: spec.fps,
    seed,
    setup: (rng: Rng): World => {
      const w: World = {
        frame: 0,
        next: 0,
        slots: Array.from({ length: count }, () => ({ x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, age: 0, life: 1 })),
        alive: new Array<boolean>(count).fill(false),
      };
      emitDue(w, rng); // t=0 emissions
      return w;
    },
    step: (w: World, dt: number, rng: Rng): void => {
      for (let i = 0; i < count; i++) {
        if (!w.alive[i]) continue;
        const s = w.slots[i]!;
        if (spec.step) {
          spec.step(s, dt, rng);
        } else {
          s.vx += windX * dt;
          s.vy += (gravity + windY) * dt;
          if (drag !== 0) {
            const k = Math.max(0, 1 - drag * dt);
            s.vx *= k;
            s.vy *= k;
          }
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.rot += s.spin * dt;
        }
        s.age += dt;
        if (s.age >= s.life) w.alive[i] = false;
      }
      w.frame++;
      emitDue(w, rng);
    },
    sample: (w: World): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (let i = 0; i < count; i++) {
        const s = w.slots[i]!;
        const id = slotId(i);
        const live = w.alive[i];
        const u = live && s.life > 0 ? clamp01(s.age / s.life) : 0;
        out[`${id}/position`] = [s.x, s.y];
        out[`${id}/opacity`] = live ? clamp01(opacityCurves[i]!(u)) : 0;
        if (emitScale) {
          const k = live ? (scaleCurves[i] ?? spec.scaleOverLife ?? (() => 1))(u) : 1;
          out[`${id}/scale`] = [k, k];
        }
        if (emitRot) out[`${id}/rotation`] = s.rot;
      }
      return out;
    },
  };

  const rawTracks = bake<World>(bakeCfg);

  // ── prune slots that are opacity-0 for the ENTIRE sim window ────────────────
  const byTarget = new Map(rawTracks.map((t) => [t.target, t] as const));
  const visible: number[] = [];
  for (let i = 0; i < count; i++) {
    const op = byTarget.get(`${slotId(i)}/opacity`);
    if (op && op.keys.some((k) => typeof k.value === 'number' && k.value > 0)) visible.push(i);
  }
  const keep = new Set(visible.map((i) => slotId(i)));
  const tracks = rawTracks.filter((t) => keep.has(t.target.slice(0, t.target.lastIndexOf('/'))));
  const children = visible.map((i) => built.children[i]!);
  const node = new Group({ id: spec.id, children });

  return { node, tracks, end: spec.duration };
}

// ── presets (0.57) — the corporate-explainer triad ───────────────────────────
//
// A LEAN sugar layer over `particles()`: each preset fills in a right-sized,
// corporate-safe default spec and forwards `...rest` (velocity/forces/lifetime,
// and the escape-hatch `appearance`/`step`) so the sugar never caps expression.
// `appearance` as a NODE-TEMPLATE (a themed dot/glyph) is the primary control.

/** Overridable ParticleSpec fields common to the presets (the `...rest` escape hatch). */
export interface ParticlePresetRest {
  seed?: number;
  lifetime?: number | readonly [number, number];
  velocity?: { speed: readonly [number, number]; angle: readonly [number, number] };
  forces?: ParticleForces;
  spin?: readonly [number, number];
  area?: AreaSpec;
  /** Safe-area clamp (relative [0,1]) — no spawn below this Y. See ParticleSpec.safeBottom. */
  safeBottom?: number;
  opacityOverLife?: OverLife;
  scaleOverLife?: OverLife;
  appearance?: (i: number, ctx: ParticleAppearanceContext) => Node | ParticleAppearance;
  step?: (p: ParticleState, dt: number, rng: Rng) => void;
}

/** Merge the preset defaults with the caller's `...rest`, spreading conditionally
 *  (exactOptionalPropertyTypes: never pass `undefined`). */
function mergeSpec(base: ParticleSpec, rest: ParticlePresetRest): ParticleSpec {
  return {
    ...base,
    ...(rest.seed !== undefined ? { seed: rest.seed } : {}),
    ...(rest.lifetime !== undefined ? { lifetime: rest.lifetime } : {}),
    ...(rest.velocity !== undefined ? { velocity: rest.velocity } : {}),
    ...(rest.forces !== undefined ? { forces: rest.forces } : {}),
    ...(rest.spin !== undefined ? { spin: rest.spin } : {}),
    ...(rest.area !== undefined ? { area: rest.area } : {}),
    ...(rest.safeBottom !== undefined ? { safeBottom: rest.safeBottom } : {}),
    ...(rest.opacityOverLife !== undefined ? { opacityOverLife: rest.opacityOverLife } : {}),
    ...(rest.scaleOverLife !== undefined ? { scaleOverLife: rest.scaleOverLife } : {}),
    ...(rest.appearance !== undefined ? { appearance: rest.appearance } : {}),
    ...(rest.step !== undefined ? { step: rest.step } : {}),
  };
}

/** A themed soft dot appearance — the default node-template for drift/sparks. */
function dotAppearance(color: string, radius: number): ParticleSpec['appearance'] {
  return () => new Circle({ radius, fill: color });
}

export interface DriftOptions extends ParticlePresetRest {
  box: { w: number; h: number };
  duration: number;
  fps: number;
  /** Max-concurrent motes (default 24 — a corporate-safe low density, NOT 200). */
  count?: number;
  /** Continuous emission rate, particles/sec (default 8). */
  rate?: number;
  /** Spawn point, relative viewport coords (default centered [0.5,0.5] — the conservative caption-safe band). */
  origin?: Place;
  /** Themed mote color (default a soft blue). */
  color?: string;
  /** Mote radius px (default 2.5). */
  radius?: number;
  /** Id prefix (default 'drift'). */
  id?: string;
}

/**
 * `drift` — ambient low-opacity motes slowly floating up, complementing a bokeh
 * background. Continuous low-rate emission; DEFAULTS to a small max-concurrent
 * count so the exported layer count stays proportional to the live particles.
 */
export function drift(opts: DriftOptions): ParticlesResult {
  const color = opts.color ?? '#9ec4ff';
  const radius = opts.radius ?? 2.5;
  const base: ParticleSpec = {
    id: opts.id ?? 'drift',
    count: opts.count ?? 24,
    box: opts.box,
    duration: opts.duration,
    fps: opts.fps,
    rate: opts.rate ?? 8,
    origin: opts.origin ?? [0.5, 0.5],
    lifetime: [3, 6],
    velocity: { speed: [4, 14], angle: [-110, -70] }, // gently upward (y-down)
    forces: { drag: 0.2 },
    // Conservative DEFAULT spawn band (0.57.1 safe-area fix): centered, height 0.36H →
    // spawn Y in ~[0.32H, 0.68H]; the 0.68H bottom clears a standard lower-third caption
    // safe-area (~0.84–0.90H), so bare drift() honors safe-area by default. Motes drift UP,
    // so the spawn bottom is the lowest point. Pass an explicit `area` and/or `safeBottom`
    // to tune for a consumer's exact captionTop.
    area: { kind: 'box', w: opts.box.w * 0.8, h: opts.box.h * 0.36 },
    opacityOverLife: fadeCurve(0.5, 0.2, 0.35),
    appearance: dotAppearance(color, radius),
  };
  return particles(mergeSpec(base, opts));
}

export interface SparksOptions extends ParticlePresetRest {
  box: { w: number; h: number };
  duration: number;
  fps: number;
  /** Max-concurrent (== burst) count (default 20). */
  count?: number;
  /** Beat second the burst fires at (default 0). */
  at?: number;
  /** Themed spark color (default a warm amber). */
  color?: string;
  /** Spark radius px (default 2.5). */
  radius?: number;
  /** Id prefix (default 'sparks'). */
  id?: string;
}

/**
 * `sparks` — a subtle, corporate-safe radial impact burst (a win-beat / habit-stamp
 * flourish): short-life dots thrown outward from `origin`, shrinking + fading with
 * a touch of gravity. LOW density by default.
 */
export function sparks(origin: Place, opts: SparksOptions): ParticlesResult {
  const color = opts.color ?? '#ffd27f';
  const radius = opts.radius ?? 2.5;
  const count = opts.count ?? 20;
  const base: ParticleSpec = {
    id: opts.id ?? 'sparks',
    count,
    box: opts.box,
    duration: opts.duration,
    fps: opts.fps,
    burst: [{ at: opts.at ?? 0, n: count }],
    origin,
    lifetime: [0.4, 0.9],
    velocity: { speed: [80, 220], angle: [0, 360] },
    forces: { gravity: 140, drag: 0.6 },
    opacityOverLife: fadeCurve(1, 0.05, 0.5),
    scaleOverLife: (u) => 1 - 0.6 * u,
    appearance: dotAppearance(color, radius),
  };
  return particles(mergeSpec(base, opts));
}

export interface DispenseOptions extends SparksOptions {
  /** Emission direction, degrees (default 90 = downward, the vending "drop"). */
  angle?: number;
  /** Half-spread around the direction, degrees (default 32). */
  spread?: number;
  /** A themed GLYPH character to sparkle instead of a dot (e.g. '✦', '★'). */
  glyph?: string;
  /** Glyph font size px (default 14). */
  glyphSize?: number;
  /** Glyph font family (default 'DejaVu Sans'). */
  glyphFamily?: string;
}

/**
 * `dispense` — a directional `sparks` variant: a small themed sparkle emanating in
 * one direction at a beat (the vending "AS ASKED" flourish ON the drop moment, not
 * a continuous stream). Directional angle bias + an optional glyph node-template.
 */
export function dispense(origin: Place, opts: DispenseOptions): ParticlesResult {
  const dir = opts.angle ?? 90;
  const spread = opts.spread ?? 32;
  const color = opts.color ?? '#ffe6a3';
  const count = opts.count ?? 14;
  const glyphAppearance: ParticleSpec['appearance'] | undefined =
    opts.glyph !== undefined
      ? () =>
          new Text({
            text: opts.glyph!,
            fill: color,
            fontFamily: opts.glyphFamily ?? 'DejaVu Sans',
            fontSize: opts.glyphSize ?? 14,
            align: 'center',
          })
      : undefined;
  const base: ParticleSpec = {
    id: opts.id ?? 'dispense',
    count,
    box: opts.box,
    duration: opts.duration,
    fps: opts.fps,
    burst: [{ at: opts.at ?? 0, n: count }],
    origin,
    lifetime: [0.5, 1.0],
    velocity: { speed: [70, 170], angle: [dir - spread, dir + spread] },
    forces: { gravity: 90, drag: 0.5 },
    opacityOverLife: fadeCurve(1, 0.06, 0.5),
    scaleOverLife: (u) => 1 - 0.5 * u,
    appearance: glyphAppearance ?? dotAppearance(color, opts.radius ?? 2.5),
  };
  // caller `appearance` (via ...rest) still wins over the glyph default.
  return particles(mergeSpec(base, opts));
}

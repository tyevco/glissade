/**
 * Particles/Emitters (0.57). particles() is a COMPOSE of each() (fixed slot nodes)
 * + bake() (seeded physics → ordinary tracks). The load-bearing invariants tested
 * here: determinism (byte-identical run-to-run, a DIFFERENT seed varies), the
 * count=max-concurrent RING BUFFER + opacity-gating + PROPORTIONAL export (pruning
 * never-visible slots), the bounded-count + fail-loud cluster (never a silent
 * clamp), and the escape hatches (`step`, `appearance`).
 */

import { describe, expect, it } from 'vitest';
import type { Track } from '@glissade/core';
import { Circle, Rect, Text } from '../src/index.js';
import {
  particles,
  drift,
  sparks,
  dispense,
  ParticleError,
  MAX_PARTICLE_COUNT,
  type ParticleSpec,
} from '../src/particles.js';

const BOX = { w: 640, h: 360 };

/** Overrides may pass an explicit `undefined` to REMOVE a default (e.g. drop `burst`). */
type SpecOverride = { [K in keyof ParticleSpec]?: ParticleSpec[K] | undefined };

/** A minimal valid burst spec (dots), overridable per test. */
function spec(over: SpecOverride = {}): ParticleSpec {
  const base: Record<string, unknown> = {
    id: 'p',
    count: 12,
    box: BOX,
    duration: 1,
    fps: 30,
    burst: 12,
    origin: [0.5, 0.5],
    lifetime: [0.4, 0.8],
    velocity: { speed: [60, 180], angle: [0, 360] },
    appearance: () => new Circle({ radius: 3, fill: '#fff' }),
  };
  for (const k of Object.keys(over) as (keyof ParticleSpec)[]) {
    const v = over[k];
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return base as unknown as ParticleSpec;
}

/** Serialize tracks to a comparable string (target + every key t/value). */
const tracksSig = (tracks: Track[]): string =>
  JSON.stringify(
    [...tracks]
      .sort((a, b) => a.target.localeCompare(b.target))
      .map((t) => [t.target, t.type, t.keys.map((k) => [k.t, k.value])]),
  );

describe('particles — composition + structure', () => {
  it('makes a Group of slot nodes at stable `${id}/${i}` ids with matching tracks', () => {
    const r = particles(spec({ id: 'burst', count: 8, burst: 8 }));
    expect(r.node.id).toBe('burst');
    expect(r.node.children.length).toBe(8);
    for (const c of r.node.children) expect(c.id).toMatch(/^burst\/\d+$/);
    // every position/opacity track targets a real slot node id
    const ids = new Set(r.node.children.map((c) => c.id));
    for (const t of r.tracks) {
      const owner = t.target.slice(0, t.target.lastIndexOf('/'));
      expect(ids.has(owner), `track ${t.target} → a real slot`).toBe(true);
    }
    // opacity + position channels exist for each slot; scale only if a curve is set
    expect(r.tracks.some((t) => /\/position$/.test(t.target))).toBe(true);
    expect(r.tracks.some((t) => /\/opacity$/.test(t.target))).toBe(true);
    expect(r.end).toBe(1);
  });

  it('emits a scale channel only when a scaleOverLife curve is present', () => {
    const none = particles(spec());
    expect(none.tracks.some((t) => /\/scale$/.test(t.target))).toBe(false);
    const withScale = particles(spec({ scaleOverLife: (u) => 1 - u }));
    expect(withScale.tracks.some((t) => /\/scale$/.test(t.target))).toBe(true);
  });

  it('emits a rotation channel only when spin is present', () => {
    const none = particles(spec());
    expect(none.tracks.some((t) => /\/rotation$/.test(t.target))).toBe(false);
    const withSpin = particles(spec({ spin: [-90, 90] }));
    expect(withSpin.tracks.some((t) => /\/rotation$/.test(t.target))).toBe(true);
  });
});

describe('particles — determinism', () => {
  it('is byte-identical run-to-run (bake reseeds from the fixed seed each call)', () => {
    const a = particles(spec({ seed: 5 }));
    const b = particles(spec({ seed: 5 }));
    expect(tracksSig(a.tracks)).toBe(tracksSig(b.tracks));
  });

  it('defaults the seed to a fixed hashStr(id) — no seed still repeats exactly', () => {
    expect(tracksSig(particles(spec()).tracks)).toBe(tracksSig(particles(spec()).tracks));
  });

  it('a DIFFERENT seed genuinely varies the output (seeded ≠ secretly constant)', () => {
    const a = particles(spec({ seed: 1 }));
    const b = particles(spec({ seed: 2 }));
    expect(tracksSig(a.tracks)).not.toBe(tracksSig(b.tracks));
  });
});

describe('particles — ring buffer + opacity-gating + proportional export', () => {
  it('count is MAX-CONCURRENT: a burst of N into a pool of N uses every slot', () => {
    const r = particles(spec({ count: 16, burst: 16 }));
    expect(r.node.children.length).toBe(16);
  });

  it('PRUNES slots that never receive a particle (proportional layer count, not `count`)', () => {
    // 10 emitted into a pool of 40 → slots 10..39 are opacity-0 the whole window → pruned
    const r = particles(spec({ count: 40, burst: 10 }));
    expect(r.node.children.length).toBe(10);
    // and only the 10 live slots carry tracks
    const owners = new Set(r.tracks.map((t) => t.target.slice(0, t.target.lastIndexOf('/'))));
    expect(owners.size).toBe(10);
  });

  it('a low-density continuous drift exports a pool proportional to live particles', () => {
    // rate 6/s over 4s with lifetime ~[1,1.5] → peak concurrent ~ handful; a
    // generous pool of 60 prunes down to the slots actually reused.
    const r = particles(
      spec({ id: 'd', count: 60, burst: undefined, rate: 6, duration: 4, lifetime: [1, 1.5] }),
    );
    expect(r.node.children.length).toBeGreaterThan(0);
    expect(r.node.children.length).toBeLessThan(60); // proportional, NOT the full pool
  });

  it('opacity-gating produces a STABLE target-path set (every kept slot has position+opacity every frame)', () => {
    const r = particles(spec({ count: 10, burst: 10, fps: 30, duration: 1 }));
    const frames = Math.round(1 * 30) + 1;
    const opac = r.tracks.filter((t) => /\/opacity$/.test(t.target));
    for (const t of opac) {
      expect(t.keys.length).toBe(frames); // dense, one key per frame — stable path
      // gated: at least one visible key (>0) and it starts/ends gated to 0 somewhere
      expect(t.keys.some((k) => (k.value as number) > 0)).toBe(true);
    }
  });

  it('a slot is opacity-0 before emit and after lifetime (timed burst gate)', () => {
    const r = particles(
      spec({ count: 4, burst: [{ at: 0.5, n: 4 }], duration: 1.5, fps: 20, lifetime: 0.4 }),
    );
    const op = r.tracks.find((t) => /\/opacity$/.test(t.target))!;
    const at = (t: number): number => op.keys.find((k) => Math.abs(k.t - t) < 1e-6)!.value as number;
    expect(at(0)).toBe(0); // before emit
    expect(op.keys.some((k) => k.t > 0.5 && k.t < 0.9 && (k.value as number) > 0)).toBe(true); // alive
    expect(at(1.4)).toBe(0); // after lifetime (emit 0.5 + life 0.4 = 0.9)
  });
});

describe('particles — fail-loud cluster (never a silent clamp)', () => {
  it('count non-integer / ≤0 / >max THROWS', () => {
    expect(() => particles(spec({ count: 2.5 }))).toThrow(ParticleError);
    expect(() => particles(spec({ count: 0 }))).toThrow(/count/);
    expect(() => particles(spec({ count: -3 }))).toThrow(/count/);
    expect(() => particles(spec({ count: MAX_PARTICLE_COUNT + 1 }))).toThrow(
      `particles(): count ${MAX_PARTICLE_COUNT + 1} exceeds max ${MAX_PARTICLE_COUNT}`,
    );
  });

  it('non-finite seed THROWS (fixed default otherwise)', () => {
    expect(() => particles(spec({ seed: Number.NaN }))).toThrow(/seed/);
    expect(() => particles(spec({ seed: Infinity }))).toThrow(/seed/);
  });

  it('rate / lifetime / fps / duration negative-zero-non-finite THROW', () => {
    expect(() => particles(spec({ burst: undefined, rate: 0 }))).toThrow(/rate/);
    expect(() => particles(spec({ burst: undefined, rate: -5 }))).toThrow(/rate/);
    expect(() => particles(spec({ lifetime: 0 }))).toThrow(/lifetime/);
    expect(() => particles(spec({ lifetime: [-1, 2] }))).toThrow(/lifetime/);
    expect(() => particles(spec({ lifetime: Number.NaN }))).toThrow(/lifetime/);
    expect(() => particles(spec({ fps: 0 }))).toThrow(/fps/);
    expect(() => particles(spec({ duration: 0 }))).toThrow(/duration/);
  });

  it('rate AND burst both absent THROWS (an emitter with neither emits nothing)', () => {
    expect(() => particles(spec({ burst: undefined, rate: undefined }))).toThrow(/rate.*burst|burst/);
  });

  it('a bad appearance node-template THROWS a clear error', () => {
    expect(() => particles(spec({ appearance: (() => 42) as unknown as ParticleSpec['appearance'] }))).toThrow(
      /appearance/,
    );
    expect(() => particles(spec({ appearance: (() => ({})) as unknown as ParticleSpec['appearance'] }))).toThrow(
      /appearance/,
    );
  });

  it('a bad box / origin THROWS', () => {
    expect(() => particles(spec({ box: { w: 0, h: 100 } }))).toThrow(/box/);
    expect(() => particles(spec({ origin: [Number.NaN, 0.5] as [number, number] }))).toThrow(/origin/);
  });
});

describe('particles — escape hatches', () => {
  it('`step` replaces the built-in integration (a raw per-particle sim)', () => {
    // a step that marches every particle straight right at a fixed rate
    const r = particles(
      spec({
        count: 3,
        burst: 3,
        fps: 10,
        duration: 1,
        lifetime: 1,
        step: (p, dt) => {
          p.x += 500 * dt;
        },
      }),
    );
    const pos = r.tracks.find((t) => /\/position$/.test(t.target))!;
    const xs = pos.keys.map((k) => (k.value as [number, number])[0]);
    // monotonically increasing x (the custom step drove it), decoupled from velocity/forces
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!);
    expect(xs.at(-1)!).toBeGreaterThan(xs[0]!);
  });

  it('`appearance` can return any Node subtree (a glyph Text) — the slot draws it', () => {
    const r = particles(
      spec({ count: 4, burst: 4, appearance: () => new Text({ text: '✦', fill: '#fd0', fontSize: 12 }) }),
    );
    expect(r.node.children.every((c) => c instanceof Text)).toBe(true);
  });

  it('per-slot appearance curves override the spec-level default', () => {
    // a slot whose opacityOverLife is a constant 1 stays fully opaque while alive
    const r = particles(
      spec({
        count: 2,
        burst: 2,
        fps: 20,
        duration: 1,
        lifetime: 1,
        appearance: () => ({ node: new Circle({ radius: 2, fill: '#fff' }), opacityOverLife: () => 1 }),
      }),
    );
    const op = r.tracks.find((t) => /\/opacity$/.test(t.target))!;
    // every live frame is exactly 1 (no fade in/out) — the per-slot curve won
    expect(op.keys.filter((k) => k.t < 0.99).every((k) => (k.value as number) === 1)).toBe(true);
  });
});

describe('presets — drift / sparks / dispense', () => {
  it('drift defaults to a small max-concurrent pool (≈tens, not 200)', () => {
    const r = drift({ box: BOX, duration: 2, fps: 30 });
    expect(r.node.id).toBe('drift');
    expect(r.node.children.length).toBeGreaterThan(0);
    expect(r.node.children.length).toBeLessThanOrEqual(24);
    expect(r.tracks.length).toBeGreaterThan(0);
  });

  it('sparks fires a radial burst from the origin — real position + opacity + scale tracks', () => {
    const r = sparks([0.5, 0.5], { box: BOX, duration: 1.5, fps: 30, count: 16 });
    expect(r.node.id).toBe('sparks');
    expect(r.node.children.length).toBe(16);
    expect(r.tracks.some((t) => /\/scale$/.test(t.target))).toBe(true); // sparks shrinks
  });

  it('sparks is deterministic and seed-sensitive', () => {
    const a = sparks([0.5, 0.5], { box: BOX, duration: 1, fps: 30, seed: 9 });
    const b = sparks([0.5, 0.5], { box: BOX, duration: 1, fps: 30, seed: 9 });
    const c = sparks([0.5, 0.5], { box: BOX, duration: 1, fps: 30, seed: 10 });
    expect(tracksSig(a.tracks)).toBe(tracksSig(b.tracks));
    expect(tracksSig(a.tracks)).not.toBe(tracksSig(c.tracks));
  });

  it('dispense biases direction and can use a glyph node-template', () => {
    const r = dispense([0.5, 0.4], { box: BOX, duration: 1, fps: 30, glyph: '★', count: 10 });
    expect(r.node.id).toBe('dispense');
    expect(r.node.children.every((c) => c instanceof Text)).toBe(true);
  });

  it('preset `...rest` forwards to particles() (appearance override reaches through)', () => {
    const r = sparks([0.5, 0.5], {
      box: BOX,
      duration: 1,
      fps: 30,
      count: 6,
      appearance: () => new Rect({ width: 4, height: 4, fill: '#0f0' }),
    });
    expect(r.node.children.every((c) => c instanceof Rect)).toBe(true);
  });
});

describe('particles — safe-area (0.57.1: conservative default + safeBottom clamp)', () => {
  // The lowest visible point is the SPAWN (motes drift up + before-emit position is [0,0]),
  // so the max Y across every position key is the deepest spawn.
  const maxPosY = (tracks: Track[]): number =>
    Math.max(
      ...tracks
        .filter((t) => /\/position$/.test(t.target))
        .flatMap((t) => t.keys.map((k) => (k.value as [number, number])[1])),
    );

  it('bare drift() default spawn band clears a standard lower-third caption safe-area', () => {
    // default: origin [0.5,0.5] + area.h = box.h*0.36 → band bottom 0.68H. A standard
    // broadcast lower-third caption safe-area sits ~0.84–0.90H, so 0.68H clears it.
    const r = drift({ box: BOX, duration: 2, fps: 30 });
    const deepest = maxPosY(r.tracks);
    expect(deepest).toBeLessThanOrEqual(0.69 * BOX.h); // the 0.68H band bottom
    expect(deepest).toBeLessThan(0.84 * BOX.h); // clears a lower-third by construction
  });

  it('safeBottom clamps the SPAWN above the safe line (no mote spawns below it)', () => {
    // safeBottom clamps the spawn region, not the trajectory — so pair it with an UPWARD
    // velocity (its intended ambient-drift use), where the spawn IS the lowest point. A wide
    // area would otherwise spawn down to 0.8H; safeBottom 0.5 clamps the deepest spawn to 0.5H.
    const r = particles(
      spec({
        id: 'sb',
        origin: [0.5, 0.5],
        area: { kind: 'box', w: 100, h: BOX.h * 0.6 },
        safeBottom: 0.5,
        velocity: { speed: [8, 16], angle: [-100, -80] }, // gently upward
      }),
    );
    expect(maxPosY(r.tracks)).toBeLessThanOrEqual(0.5 * BOX.h + 1e-6);
  });

  it('drift forwards safeBottom through `...rest` (the wrapper escape hatch)', () => {
    const r = drift({ box: BOX, duration: 2, fps: 30, safeBottom: 0.5 });
    expect(maxPosY(r.tracks)).toBeLessThanOrEqual(0.5 * BOX.h + 1e-6);
  });

  it('safeBottom fail-loud: non-finite, out-of-[0,1] (the px mistake), and above-band-top all THROW', () => {
    expect(() => particles(spec({ safeBottom: Number.NaN }))).toThrow(/safeBottom/);
    // the most likely footgun: a captionTop passed in px instead of relative [0,1]
    expect(() => particles(spec({ safeBottom: 907 }))).toThrow(/safeBottom.*\[0,1\]|RELATIVE/);
    expect(() => particles(spec({ safeBottom: -0.1 }))).toThrow(/safeBottom/);
    // a safeBottom ABOVE the spawn band top → no valid spawn region (empty-region guard).
    // origin [0.5,0.5] + area h=box.h*0.6 → band top 0.2H; safeBottom 0.1 < 0.2 → throw.
    expect(() =>
      particles(spec({ origin: [0.5, 0.5], area: { kind: 'box', w: 100, h: BOX.h * 0.6 }, safeBottom: 0.1 })),
    ).toThrow(/no valid spawn region|spawn band top/);
  });
});

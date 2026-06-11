import { describe, expect, it } from 'vitest';
import {
  bake,
  bakeCheckpointed,
  compileTimeline,
  sampleTrack,
  timeline,
  BakeError,
  type Rng,
  type Track,
  type Vec2,
} from '../src/index.js';

/** Bouncing ball under gravity — genuinely stateful (velocity accumulates). */
interface World {
  pos: Vec2;
  vel: Vec2;
  bounces: number;
}

const ballSim = {
  duration: 2,
  fps: 60,
  seed: 42,
  setup: (rng: Rng): World => ({ pos: [rng() * 100, 0], vel: [60, 0], bounces: 0 }),
  step: (w: World, dt: number): World => {
    const vy = w.vel[1] + 980 * dt;
    let y = w.pos[1] + vy * dt;
    let bounces = w.bounces;
    let outVy = vy;
    if (y > 300) {
      y = 300;
      outVy = -vy * 0.8;
      bounces++;
    }
    return { pos: [w.pos[0] + w.vel[0] * dt, y], vel: [w.vel[0], outVy], bounces };
  },
  sample: (w: World) => ({ 'ball/position': w.pos, 'ball/bounces': w.bounces }),
};

describe('bake() (§2.8)', () => {
  it('emits one key per frame per path, on the frame grid', () => {
    const tracks = bake(ballSim);
    const pos = tracks.find((t) => t.target === 'ball/position')!;
    expect(pos.keys).toHaveLength(2 * 60 + 1);
    expect(pos.keys[0]!.t).toBe(0);
    expect(pos.keys.at(-1)!.t).toBeCloseTo(2, 9);
    expect(pos.type).toBe('vec2');
    expect(tracks.find((t) => t.target === 'ball/bounces')!.type).toBe('number');
  });

  it('is deterministic: same seed → identical tracks; different seed → different', () => {
    expect(bake(ballSim)).toEqual(bake(ballSim));
    expect(bake({ ...ballSim, seed: 7 })).not.toEqual(bake(ballSim));
  });

  it('the ball actually bounces (statefulness the pure model cannot express)', () => {
    const tracks = bake(ballSim);
    const bounces = tracks.find((t) => t.target === 'ball/bounces')!;
    expect(bounces.keys.at(-1)!.value).toBeGreaterThan(0);
  });

  it('baked tracks compose into a timeline and seek randomly (§2.5 preserved)', () => {
    const doc = timeline({ tracks: bake(ballSim) as Track[] });
    const compiled = compileTimeline(doc);
    const pos = compiled.tracks.get('ball/position')!;
    const ts = [1.7, 0.2, 1.0, 0.5, 2.0];
    const a = ts.map((t) => sampleTrack(pos, t));
    const b = [...ts].sort().map((t) => sampleTrack(pos, t));
    for (let i = 0; i < ts.length; i++) {
      expect(a[i]).toEqual(b[[...ts].sort().indexOf(ts[i]!)]);
    }
  });

  it('supports in-place mutation steppers (void return)', () => {
    const tracks = bake({
      duration: 1,
      fps: 10,
      setup: () => ({ x: 0 }),
      step: (w, dt) => {
        w.x += dt * 10;
      },
      sample: (w) => ({ 'n/x': w.x }),
    });
    expect(sampleTrack(tracks[0]!, 1)).toBeCloseTo(10, 9);
  });

  it('rejects invalid config', () => {
    expect(() => bake({ ...ballSim, fps: 0 })).toThrow(BakeError);
  });
});

describe('bakeCheckpointed (§2.8)', () => {
  const checkpointed = () =>
    bakeCheckpointed({
      ...ballSim,
      every: 30,
      snapshot: (w) => structuredClone(w),
      restore: (s) => structuredClone(s),
    });

  it('any range is bit-identical to the same slice of a full bake', () => {
    const full = bake(ballSim);
    const sim = checkpointed();
    for (const [from, to] of [
      [0, 120],
      [45, 90],
      [100, 120],
      [31, 31],
      [0, 0],
    ] as const) {
      const ranged = sim.bakeRange(from, to);
      for (const tr of ranged) {
        const fullTrack = full.find((t) => t.target === tr.target)!;
        const slice = fullTrack.keys.filter((k) => k.t >= from / 60 - 1e-9 && k.t <= to / 60 + 1e-9);
        expect(tr.keys, `${tr.target} ${from}..${to}`).toEqual(slice);
      }
    }
  });

  it('ranges work in any order (backward seeks restore checkpoints)', () => {
    const sim = checkpointed();
    const late = sim.bakeRange(90, 120);
    const early = sim.bakeRange(0, 30);
    const lateAgain = sim.bakeRange(90, 120);
    expect(lateAgain).toEqual(late);
    expect(early[0]!.keys[0]!.t).toBe(0);
  });

  it('RNG consumption is checkpointed: rng-using steppers stay deterministic across ranges', () => {
    const noisy = {
      duration: 1,
      fps: 30,
      seed: 9,
      every: 10,
      setup: (rng: Rng) => ({ x: rng() }),
      step: (w: { x: number }, _dt: number, rng: Rng) => ({ x: w.x + rng() }),
      sample: (w: { x: number }) => ({ 'n/x': w.x }),
      snapshot: (w: { x: number }) => ({ ...w }),
      restore: (s: { x: number }) => ({ ...s }),
    };
    const full = bake(noisy);
    const sim = bakeCheckpointed(noisy);
    expect(sim.bakeRange(15, 30)[0]!.keys).toEqual(
      full[0]!.keys.filter((k) => k.t >= 15 / 30 - 1e-9),
    );
  });

  it('rejects out-of-range requests', () => {
    expect(() => checkpointed().bakeRange(0, 99999)).toThrow(BakeError);
  });
});

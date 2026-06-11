/**
 * bake() (DESIGN.md §2.8): stateful simulation as a compilation step. Run the
 * stepper ONCE — fixed dt, seeded RNG — and emit ordinary frame-indexed
 * Tracks; rendering stays a pure lookup and the §2.5 contract survives.
 * The checkpointed variant trades memory for bounded re-simulation.
 */

import { random, type Rng } from './rng.js';
import { type Key, type Track } from './track.js';
import { inferValueType } from './valueTypes.js';

export interface BakeConfig<W> {
  /** seconds of simulation; keys land on the frame grid */
  duration: number;
  /** fixed dt = 1/fps — never wall clock */
  fps: number;
  seed?: number;
  setup: (rng: Rng) => W;
  /** Advance one fixed step. Return the next world, or mutate in place and return nothing. */
  step: (world: W, dt: number, rng: Rng) => W | undefined | void;
  /** One value per target path; sampled every frame. */
  sample: (world: W) => Record<string, unknown>;
}

export class BakeError extends Error {
  constructor(detail: string) {
    super(`bake(): ${detail}`);
    this.name = 'BakeError';
  }
}

interface TrackAccumulator {
  keys: Key[];
  type: string;
}

function emit(acc: Map<string, TrackAccumulator>, sampled: Record<string, unknown>, t: number): void {
  for (const [path, value] of Object.entries(sampled)) {
    let a = acc.get(path);
    if (!a) {
      a = { keys: [], type: inferValueType(value) };
      acc.set(path, a);
    }
    a.keys.push({ t, value });
  }
}

function toTracks(acc: Map<string, TrackAccumulator>): Track[] {
  return [...acc.entries()].map(([target, a]) => ({
    target,
    type: a.type,
    keys: a.keys,
  }));
}

export function bake<W>(cfg: BakeConfig<W>): Track[] {
  if (!(cfg.fps > 0) || !(cfg.duration >= 0)) throw new BakeError('fps must be > 0 and duration >= 0');
  const rng = random(cfg.seed ?? 0);
  const dt = 1 / cfg.fps;
  const frames = Math.round(cfg.duration * cfg.fps);
  let world = cfg.setup(rng);
  const acc = new Map<string, TrackAccumulator>();
  emit(acc, cfg.sample(world), 0);
  for (let f = 1; f <= frames; f++) {
    world = (cfg.step(world, dt, rng) ?? world) as W;
    emit(acc, cfg.sample(world), f * dt);
  }
  return toTracks(acc);
}

export interface CheckpointedBakeConfig<W, S = W> extends BakeConfig<W> {
  /** snapshot every K frames */
  every: number;
  snapshot: (world: W) => S;
  restore: (snap: S) => W;
}

export interface CheckpointedSim {
  /**
   * Re-simulate from the nearest checkpoint and emit tracks covering
   * [fromFrame, toFrame] (inclusive). Bit-identical to the same slice of a
   * full bake() — only the memory/latency profile differs (§2.8). Export
   * shards call this per range.
   */
  bakeRange(fromFrame: number, toFrame: number): Track[];
  readonly frames: number;
}

export function bakeCheckpointed<W, S = W>(cfg: CheckpointedBakeConfig<W, S>): CheckpointedSim {
  if (!(cfg.every >= 1)) throw new BakeError('checkpoint interval `every` must be >= 1 frame');
  const dt = 1 / cfg.fps;
  const totalFrames = Math.round(cfg.duration * cfg.fps);

  // checkpoints[i] = state at frame i*every. The RNG is part of the
  // deterministic trajectory, so its position (draw count) is checkpointed
  // too and re-derived by replaying draws from the seed.
  interface Checkpoint {
    snap: S;
    rngDraws: number;
  }
  let draws = 0;
  const baseRng = random(cfg.seed ?? 0);
  const countingRng: Rng = () => {
    draws++;
    return baseRng();
  };
  const rngAt = (targetDraws: number): Rng => {
    const r = random(cfg.seed ?? 0);
    for (let i = 0; i < targetDraws; i++) r();
    return r;
  };

  let world = cfg.setup(countingRng);
  const checkpoints: Checkpoint[] = [{ snap: cfg.snapshot(world), rngDraws: draws }];
  let simulatedTo = 0;

  /** Advance the master simulation, recording a checkpoint every K frames. */
  function ensureSimulatedTo(frame: number): void {
    while (simulatedTo < Math.min(frame, totalFrames)) {
      world = (cfg.step(world, dt, countingRng) ?? world) as W;
      simulatedTo++;
      if (simulatedTo % cfg.every === 0) {
        checkpoints.push({ snap: cfg.snapshot(world), rngDraws: draws });
      }
    }
  }

  return {
    frames: totalFrames,
    bakeRange(fromFrame, toFrame) {
      if (fromFrame < 0 || toFrame > totalFrames || fromFrame > toFrame) {
        throw new BakeError(`range ${fromFrame}..${toFrame} outside 0..${totalFrames}`);
      }
      const cpFrame = Math.floor(fromFrame / cfg.every) * cfg.every;
      ensureSimulatedTo(cpFrame);
      const cp = checkpoints[cpFrame / cfg.every]!;

      let w = cfg.restore(cp.snap);
      const rng = rngAt(cp.rngDraws);
      let frame = cpFrame;

      const acc = new Map<string, TrackAccumulator>();
      if (frame >= fromFrame) emit(acc, cfg.sample(w), frame * dt);
      while (frame < toFrame) {
        w = (cfg.step(w, dt, rng) ?? w) as W;
        frame++;
        if (frame >= fromFrame) emit(acc, cfg.sample(w), frame * dt);
      }
      return toTracks(acc);
    },
  };
}

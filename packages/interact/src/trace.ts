/**
 * Record → replay → bake (§A.6 route 2, §C.5): the export story for live
 * input. Traces record RAW, PRE-FILTER input values at raw timestamps —
 * replay quantizes events to the frame grid and steps the machine at
 * synthetic now = frame/fps, so replay of a given trace is bit-deterministic
 * per pinned engine while approximating the live session to within one frame
 * of event timing (§B.5). bakeTrace emits a plain version-1 linear Timeline:
 * scrubbable, diffable, consumable by any v1 pipeline with zero machine
 * awareness.
 */

import { emitDevWarning, key, timeline, track, type Key, type Timeline, type Track } from '@glissade/core';
import type { Scene } from '@glissade/scene';
import type { Machine } from './machine.js';
import type { StateMachineDoc } from './doc.js';

export type TraceEvent = { t: number; input: string; value: boolean | number } | { t: number; fire: string };

/** The single trace schema (§C.5): an event list — never dense samples. */
export interface InputTrace {
  version: 1;
  /** hash(machine doc) + per-referenced-timeline hashes; mismatch at bake is an error. */
  machineHash: string;
  /** Replay quantization grid (§5.5 sample-position arithmetic). */
  fps: number;
  initialInputs: Record<string, boolean | number>;
  /** Raw wall-clock seconds relative to record start; pre-filter values. */
  events: TraceEvent[];
}

export interface RecordOptions {
  /** Replay grid stored in the trace; default 60. */
  fps?: number;
  /** Time source (seconds); defaults to performance.now()/1000. Events store t relative to start. */
  now?: () => number;
}

export interface TraceRecorder {
  /** Restore the tapped writers and return the trace. */
  stop(): InputTrace;
}

/**
 * Tap a live machine's raw input writes (§C.5). Transparent: set()/fire()
 * keep working; stop() restores them. Recording raw keeps every take
 * re-bakeable after tuning a smoothing spring (§C.2).
 */
export function recordTrace(machine: Machine, opts: RecordOptions = {}): TraceRecorder {
  const fps = opts.fps ?? 60;
  const now = opts.now ?? (() => performance.now() / 1000);
  const t0 = now();
  const initialInputs: Record<string, boolean | number> = {};
  const events: TraceEvent[] = [];
  const restores: Array<() => void> = [];

  for (const [name, decl] of Object.entries(machine.doc.inputs ?? {})) {
    if (decl.type === 'trigger') continue;
    const sig = machine.input(name);
    initialInputs[name] = sig();
    const callable = sig as unknown as Record<string, unknown>;
    const orig = callable['set'] as (v: boolean | number) => void;
    callable['set'] = (v: boolean | number) => {
      events.push({ t: now() - t0, input: name, value: v });
      orig(v);
    };
    restores.push(() => {
      callable['set'] = orig;
    });
  }
  const origFire = machine.fire.bind(machine);
  (machine as { fire(name: string): void }).fire = (name) => {
    events.push({ t: now() - t0, fire: name });
    origFire(name);
  };
  restores.push(() => {
    (machine as { fire(name: string): void }).fire = origFire;
  });

  return {
    stop() {
      for (const r of restores) r();
      return { version: 1, machineHash: machine.hash, fps, initialInputs, events };
    },
  };
}

export class TraceHashMismatchError extends Error {
  constructor(expected: string, got: string) {
    super(
      `trace hash ${got} != machine ${expected}: the doc or a referenced timeline changed — re-record or pass force (§C.5)`,
    );
    this.name = 'TraceHashMismatchError';
  }
}

export interface BakeTraceOptions {
  /** Output length in seconds; default: last event time + 1 s of settle. */
  duration?: number;
  /** Sampling grid; default: the trace's fps. */
  fps?: number;
  /** Downgrade a hash mismatch to a warning — re-baking an old take against tweaked timelines is legitimate. */
  force?: boolean;
}

/**
 * Replay a trace through a FRESH machine and emit a plain linear Timeline —
 * bake() (§2.8) with the machine as the stepper: one track per bound target,
 * frame-indexed keys. Bit-deterministic for a given trace (§B.5).
 */
export function bakeTrace(machine: Machine, trace: InputTrace, opts: BakeTraceOptions = {}): Timeline {
  if (trace.version !== 1) throw new Error(`unsupported trace version ${String(trace.version)}`);
  if (machine.hasStepped) {
    throw new Error('bakeTrace needs a fresh machine: replay is deterministic from the initial state (§A.6)');
  }
  if (trace.machineHash !== machine.hash) {
    if (!opts.force) throw new TraceHashMismatchError(machine.hash, trace.machineHash);
    emitDevWarning(`trace hash mismatch (${trace.machineHash} vs ${machine.hash}): baking anyway (force)`);
  }
  const fps = opts.fps ?? trace.fps;
  const lastT = trace.events.length > 0 ? trace.events[trace.events.length - 1]!.t : 0;
  const duration = opts.duration ?? lastT + 1;
  const frames = Math.max(1, Math.ceil(duration * fps));

  // events land on their quantized frame boundary (§A.6)
  const byFrame = new Map<number, TraceEvent[]>();
  for (const e of trace.events) {
    const f = Math.round(e.t * fps);
    if (f >= frames) continue;
    let list = byFrame.get(f);
    if (!list) {
      list = [];
      byFrame.set(f, list);
    }
    list.push(e);
  }

  for (const [name, v] of Object.entries(trace.initialInputs)) machine.input(name).set(v);

  const keysByTarget = new Map<string, { type: string; keys: Key[] }>();
  for (let f = 0; f < frames; f++) {
    for (const e of byFrame.get(f) ?? []) {
      if ('fire' in e) machine.fire(e.fire);
      else machine.input(e.input).set(e.value);
    }
    const t = f / fps;
    machine.step(t);
    for (const [target, sample] of machine.sampleTargets(t)) {
      let entry = keysByTarget.get(target);
      if (!entry) {
        entry = { type: sample.type, keys: [] };
        keysByTarget.set(target, entry);
      }
      entry.keys.push(key(t, sample.value));
    }
  }

  const tracks: Track[] = [];
  for (const [target, { type, keys }] of keysByTarget) {
    // a target first bound mid-replay starts at its first sampled frame
    tracks.push(track(target, type, keys));
  }
  return timeline({ fps, duration: frames / fps, tracks });
}

/**
 * Scene-module machine declaration (§A.6/§C.6) — the convention `gs render`
 * and `gs dev` consume: `export default { createScene, timeline, machines }`.
 */
export interface MachineSpec {
  doc: StateMachineDoc;
  /** Resolved documents for `{ ref }` states. */
  timelines?: Record<string, Timeline>;
  /** Live wiring (listeners, drivers) for dev and embeds; replay never calls it. */
  wire?: (ctx: { scene: Scene; machine: Machine; element: Element }) => (() => void) | void;
}

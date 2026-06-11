import { beforeEach, describe, expect, it } from 'vitest';
import {
  key,
  sampleTrack,
  setDevWarning,
  signal,
  timeline,
  track,
  type BindableSignal,
  type Track,
} from '@glissade/core';
import {
  bakeTrace,
  createMachine,
  hashMachine,
  recordTrace,
  TraceHashMismatchError,
  type InputTrace,
  type StateMachineDoc,
} from '../src/index.js';

let warnings: string[] = [];
beforeEach(() => {
  warnings = [];
  setDevWarning((m) => warnings.push(m));
});

function targetSigs(...names: string[]) {
  const map = new Map<string, BindableSignal<unknown>>();
  for (const n of names) map.set(n, signal<unknown>(0));
  return { sig: (n: string) => map.get(n)!, resolve: (t: string) => map.get(t) };
}

const tlIdle = timeline({
  tracks: [track('btn/x', 'number', [key(0, 0)]), track('btn/fill', 'color', [key(0, '#000000')])],
});
const tlHover = timeline({
  tracks: [
    track('btn/x', 'number', [key(0, 100), key(1, 300, 'easeOutQuad')]),
    track('btn/fill', 'color', [key(0, '#ff0000')]),
  ],
});

const DOC: StateMachineDoc = {
  version: 1,
  id: 'button',
  inputs: { hovered: { type: 'boolean', default: false }, press: { type: 'trigger' } },
  initial: 'idle',
  states: { idle: { timeline: tlIdle }, hover: { timeline: tlHover } },
  transitions: [
    { id: 't1', from: 'idle', to: 'hover', conditions: [{ input: 'hovered', is: true }], duration: 0.2 },
    { id: 't2', from: 'hover', to: 'idle', conditions: [{ input: 'hovered', is: false }], duration: 0.2 },
  ],
};

const fresh = () => {
  const { resolve, sig } = targetSigs('btn/x', 'btn/fill');
  return { machine: createMachine(DOC, { resolve }), sig };
};

describe('hashMachine (§C.5): trace identity', () => {
  it('is stable under object key order and changes with content', () => {
    const reordered: StateMachineDoc = JSON.parse(JSON.stringify(DOC));
    // rebuild states in reverse insertion order
    reordered.states = { hover: DOC.states['hover']!, idle: DOC.states['idle']! };
    expect(hashMachine(reordered)).toBe(hashMachine(DOC));
    const edited: StateMachineDoc = JSON.parse(JSON.stringify(DOC));
    edited.transitions[0]!.duration = 0.25;
    expect(hashMachine(edited)).not.toBe(hashMachine(DOC));
  });

  it('covers referenced timeline documents, not just the doc', () => {
    const a = hashMachine(DOC, { 'tl-x': tlIdle });
    const b = hashMachine(DOC, { 'tl-x': tlHover });
    expect(a).not.toBe(b);
  });

  it('a machine exposes its hash; { ref } timelines feed it', () => {
    const { resolve } = targetSigs('btn/x', 'btn/fill');
    const refDoc: StateMachineDoc = JSON.parse(JSON.stringify(DOC));
    refDoc.states['idle']!.timeline = { ref: 'tl-idle' };
    const m1 = createMachine(refDoc, { resolve, timelines: { 'tl-idle': tlIdle } });
    const m2 = createMachine(refDoc, { resolve, timelines: { 'tl-idle': tlHover } });
    expect(m1.hash).not.toBe(m2.hash);
  });
});

describe('recordTrace (§C.5): raw pre-filter values, raw timestamps, transparent tap', () => {
  it('captures initialInputs, taps set()/fire() relative to record start, and restores on stop', () => {
    const { machine } = fresh();
    machine.input('hovered').set(true); // pre-record state
    let t = 100;
    const rec = recordTrace(machine, { fps: 30, now: () => t });
    t = 100.5;
    machine.input('hovered').set(false); // tapped — and still takes effect
    t = 101.25;
    machine.fire('press'); // unknown to the doc? no — press is declared
    const trace = rec.stop();
    machine.input('hovered').set(true); // after stop: not recorded
    expect(trace).toEqual({
      version: 1,
      machineHash: machine.hash,
      fps: 30,
      initialInputs: { hovered: true },
      events: [
        { t: 0.5, input: 'hovered', value: false },
        { t: 1.25, fire: 'press' },
      ],
    });
    expect(machine.input('hovered')()).toBe(true); // writes flowed through the tap
  });
});

describe('bakeTrace (§A.6): replay → plain linear Timeline', () => {
  const TRACE: InputTrace = {
    version: 1,
    machineHash: '', // filled per machine below
    fps: 30,
    initialInputs: { hovered: false },
    events: [
      { t: 0.5, input: 'hovered', value: true },
      { t: 1.5, input: 'hovered', value: false },
    ],
  };
  const traceFor = (machine: { hash: string }): InputTrace => ({ ...TRACE, machineHash: machine.hash });

  it('requires a fresh machine and a matching hash; force downgrades to a warning', () => {
    const used = fresh().machine;
    used.step(0);
    expect(() => bakeTrace(used, traceFor(used))).toThrow(/fresh machine/);

    const { machine } = fresh();
    expect(() => bakeTrace(machine, { ...TRACE, machineHash: 'deadbeef' })).toThrow(TraceHashMismatchError);
    const baked = bakeTrace(machine, { ...TRACE, machineHash: 'deadbeef' }, { force: true });
    expect(warnings.some((w) => w.includes('hash mismatch'))).toBe(true);
    expect(baked.version).toBe(1);
  });

  it('emits a frame-gridded v1 Timeline that reproduces a manual replay bit-for-bit', () => {
    const { machine } = fresh();
    const trace = traceFor(machine);
    const baked = bakeTrace(machine, trace, { duration: 2.5 });
    expect(baked.fps).toBe(30);
    expect(baked.duration).toBe(75 / 30);
    const xTrack = baked.tracks.find((tr) => tr.target === 'btn/x') as Track<number>;
    const fillTrack = baked.tracks.find((tr) => tr.target === 'btn/fill') as Track<string>;
    expect(xTrack.keys.length).toBe(75);

    // manual replay: same quantization, fresh machine — every frame must match
    const replay = fresh().machine;
    replay.input('hovered').set(false);
    for (let f = 0; f < 75; f++) {
      if (f === Math.round(0.5 * 30)) replay.input('hovered').set(true);
      if (f === Math.round(1.5 * 30)) replay.input('hovered').set(false);
      replay.step(f / 30);
      const samples = replay.sampleTargets(f / 30);
      expect(xTrack.keys[f]!.value).toBe(samples.get('btn/x')!.value); // key values: bit-exact
      expect(fillTrack.keys[f]!.value).toBe(samples.get('btn/fill')!.value);
      // and the baked document samples like any v1 track (number lerp at a key is exact)
      expect(sampleTrack(xTrack, f / 30)).toBe(samples.get('btn/x')!.value);
    }
  });

  it('replay-to-replay is bit-stable (§B.5)', () => {
    const a = fresh().machine;
    const b = fresh().machine;
    const baked1 = JSON.stringify(bakeTrace(a, traceFor(a), { duration: 2 }));
    const baked2 = JSON.stringify(bakeTrace(b, traceFor(b), { duration: 2 }));
    expect(baked1).toBe(baked2);
  });

  it('events land on their quantized frame boundary, not before', () => {
    const { machine } = fresh();
    // t = 0.524 s at 30 fps → frame round(15.7) = 16
    const trace: InputTrace = {
      version: 1,
      machineHash: machine.hash,
      fps: 30,
      initialInputs: {},
      events: [{ t: 0.524, input: 'hovered', value: true }],
    };
    const baked = bakeTrace(machine, trace, { duration: 1 });
    const xTrack = baked.tracks.find((tr) => tr.target === 'btn/x') as Track<number>;
    expect(xTrack.keys[15]!.value).toBe(0); // still idle at frame 15
    expect(xTrack.keys[17]!.value).not.toBe(0); // transition under way after frame 16
  });

  it('defaults duration to the last event + 1 s of settle', () => {
    const { machine } = fresh();
    const baked = bakeTrace(machine, traceFor(machine));
    expect(baked.duration).toBeCloseTo(Math.ceil((1.5 + 1) * 30) / 30, 9);
  });
});

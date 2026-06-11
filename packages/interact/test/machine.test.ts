import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginReadPhase,
  endReadPhase,
  key,
  setDevWarning,
  signal,
  timeline,
  track,
  UnboundTargetError,
  WriteDuringEvaluationError,
  type BindableSignal,
  type Timeline,
} from '@glissade/core';
import {
  createMachine,
  MachineValidationError,
  UnknownInputError,
  validateMachineDoc,
  type StateMachineDoc,
  type TransitionDoc,
} from '../src/index.js';

let warnings: string[] = [];
beforeEach(() => {
  warnings = [];
  setDevWarning((m) => warnings.push(m));
});

function targetSigs(...names: string[]) {
  const map = new Map<string, BindableSignal<unknown>>();
  for (const n of names) map.set(n, signal<unknown>(0));
  return {
    sig: (n: string) => map.get(n)!,
    resolve: (t: string) => map.get(t),
  };
}

const tlIdle = timeline({ tracks: [track('btn/x', 'number', [key(0, 0), key(1, 100)])] });
const tlHover = timeline({ tracks: [track('btn/x', 'number', [key(0, 200), key(2, 400)])] });
const tlTap = timeline({ tracks: [track('btn/x', 'number', [key(0, 500), key(0.5, 600)])] });

function buttonDoc(transitions: TransitionDoc[], states?: StateMachineDoc['states']): StateMachineDoc {
  return {
    version: 1,
    id: 'button',
    inputs: {
      hovered: { type: 'boolean', default: false },
      level: { type: 'number', default: 0 },
      press: { type: 'trigger' },
    },
    initial: 'idle',
    states: states ?? { idle: { timeline: tlIdle }, hover: { timeline: tlHover }, tap: { timeline: tlTap } },
    transitions,
  };
}

const T_HOVER: TransitionDoc[] = [
  { id: 't1', from: 'idle', to: 'hover', conditions: [{ input: 'hovered', is: true }] },
  { id: 't2', from: 'hover', to: 'idle', conditions: [{ input: 'hovered', is: false }] },
];

describe('document validation (§A.3/§A.4)', () => {
  const base = buttonDoc(T_HOVER);

  it('rejects unknown versions and the reserved-not-valid crossfade handoff', () => {
    expect(() => validateMachineDoc({ ...base, version: 2 as 1 })).toThrow(MachineValidationError);
    expect(() =>
      validateMachineDoc(
        buttonDoc([{ id: 'x', from: 'idle', to: 'hover', conditions: [], exitTime: 1, handoff: 'crossfade' as never }]),
      ),
    ).toThrow(/reserved, not valid in version 1/);
  });

  it('rejects unknown states, inputs, mistyped conditions, bad ranges, duplicate ids', () => {
    expect(() => validateMachineDoc({ ...base, initial: 'nope' })).toThrow(/initial state/);
    expect(() => validateMachineDoc(buttonDoc([{ id: 'x', from: 'gone', to: 'hover', conditions: [] }]))).toThrow(
      /unknown source state/,
    );
    expect(() =>
      validateMachineDoc(buttonDoc([{ id: 'x', from: 'idle', to: 'hover', conditions: [{ input: 'nope', is: true }] }])),
    ).toThrow(/unknown input/);
    expect(() =>
      validateMachineDoc(
        buttonDoc([{ id: 'x', from: 'idle', to: 'hover', conditions: [{ input: 'level', is: true }] }]),
      ),
    ).toThrow(/expects a boolean input/);
    expect(() =>
      validateMachineDoc(
        buttonDoc([{ id: 'x', from: 'idle', to: 'hover', conditions: [{ trigger: 'hovered' }] }]),
      ),
    ).toThrow(/not a declared trigger/);
    expect(() =>
      validateMachineDoc(buttonDoc([{ id: 'x', from: 'idle', to: 'hover', conditions: [], exitTime: 1.5 }])),
    ).toThrow(/exitTime/);
    expect(() =>
      validateMachineDoc(
        buttonDoc([
          { id: 'x', from: 'idle', to: 'hover', conditions: [], exitTime: 1 },
          { id: 'x', from: 'hover', to: 'idle', conditions: [], exitTime: 1 },
        ]),
      ),
    ).toThrow(/duplicate transition id/);
  });

  it('warns on per-frame oscillators and non-interruptible springs', () => {
    validateMachineDoc(buttonDoc([{ id: 'x', from: 'idle', to: 'hover', conditions: [] }]));
    expect(warnings.some((w) => w.includes('per-frame oscillator'))).toBe(true);
    validateMachineDoc(
      buttonDoc([
        { id: 'y', from: 'idle', to: 'hover', conditions: [], exitTime: 1, handoff: 'spring', interruptible: false },
      ]),
    );
    expect(warnings.some((w) => w.includes('emergent'))).toBe(true);
  });
});

describe('createMachine wiring', () => {
  it('binds the initial state and advances its local playhead with steps', () => {
    const { sig, resolve } = targetSigs('btn/x');
    const m = createMachine(buttonDoc(T_HOVER), { resolve });
    expect(sig('btn/x')()).toBe(0);
    m.step(10); // anchored at first step
    expect(sig('btn/x')()).toBe(0);
    m.step(10.5);
    expect(sig('btn/x')()).toBeCloseTo(50, 9);
    expect(m.current()).toBe('idle');
    expect([...m.targets]).toEqual(['btn/x']);
  });

  it('resolves { ref } states through options.timelines and throws on a missing document', () => {
    const { sig, resolve } = targetSigs('btn/x');
    const doc = buttonDoc(T_HOVER, {
      idle: { timeline: { ref: 'tl-idle' } },
      hover: { timeline: tlHover },
      tap: { timeline: tlTap },
    });
    expect(() => createMachine(doc, { resolve })).toThrow(/no document was provided/);
    const m = createMachine(doc, { resolve, timelines: { 'tl-idle': tlIdle } });
    m.step(0);
    m.step(0.25);
    expect(sig('btn/x')()).toBeCloseTo(25, 9);
  });

  it('throws UnboundTargetError when a target resolves to nothing (§2.2)', () => {
    expect(() => createMachine(buttonDoc(T_HOVER), { resolve: () => undefined })).toThrow(UnboundTargetError);
  });

  it('input()/fire() throw loudly on unknown or wrong-kind names (§A.2)', () => {
    const { resolve } = targetSigs('btn/x');
    const m = createMachine(buttonDoc(T_HOVER), { resolve });
    expect(() => m.input('hoverd')).toThrow(UnknownInputError);
    expect(() => m.input('press')).toThrow(/use fire\(\)/);
    expect(() => m.fire('hovered')).toThrow(/not a trigger/);
    expect(() => m.fire('nope')).toThrow(UnknownInputError);
  });

  it('initialInputs settle via a normal transition on the first step (§A.1)', () => {
    const { resolve } = targetSigs('btn/x');
    const m = createMachine(buttonDoc(T_HOVER), { resolve, initialInputs: { hovered: true } });
    expect(m.current()).toBe('idle');
    m.step(0);
    expect(m.current()).toBe('hover');
    expect(() => createMachine(buttonDoc(T_HOVER), { resolve, initialInputs: { nope: 1 } })).toThrow(
      /unknown input 'nope'/,
    );
  });
});

describe('step semantics (§A.3/§A.5)', () => {
  it('takes a boolean transition; duration 0 is a hard cut', () => {
    const { sig, resolve } = targetSigs('btn/x');
    const m = createMachine(buttonDoc(T_HOVER), { resolve });
    m.step(0);
    m.step(0.5);
    m.input('hovered').set(true);
    m.step(0.6);
    expect(m.current()).toBe('hover');
    expect(sig('btn/x')()).toBe(200); // hover restarts at local 0
    m.step(1.6);
    expect(sig('btn/x')()).toBeCloseTo(300, 9); // 1s into hover
  });

  it('number conditions compare with the declared op', () => {
    const { resolve } = targetSigs('btn/x');
    const m = createMachine(
      buttonDoc([{ id: 'n1', from: 'idle', to: 'hover', conditions: [{ input: 'level', op: '>', value: 0.5 }] }]),
      { resolve },
    );
    m.step(0);
    m.input('level').set(0.5);
    m.step(0.1);
    expect(m.current()).toBe('idle'); // strict >
    m.input('level').set(0.51);
    m.step(0.2);
    expect(m.current()).toBe('hover');
  });

  it('triggers are consumed by the taking transition and otherwise drop at end of step', () => {
    const { resolve } = targetSigs('btn/x');
    const m = createMachine(
      buttonDoc([
        { id: 'p1', from: 'idle', to: 'tap', conditions: [{ trigger: 'press' }] },
        { id: 'p2', from: 'tap', to: 'idle', conditions: [{ trigger: 'press' }] },
      ]),
      { resolve },
    );
    m.step(0);
    m.fire('press');
    m.step(0.1);
    expect(m.current()).toBe('tap'); // consumed by p1...
    m.step(0.2);
    expect(m.current()).toBe('tap'); // ...so p2 does not also fire
    m.fire('press');
    // fired but not stepped-on yet; an unrelated evaluated step drops it
    m.step(0.3);
    expect(m.current()).toBe('idle');
    m.step(0.4);
    expect(m.current()).toBe('idle'); // queue was drained, not re-delivered
  });

  it('at most one transition per step: empty-condition chains resolve one step at a time', () => {
    const { resolve } = targetSigs('btn/x');
    const m = createMachine(
      buttonDoc([
        { id: 'c1', from: 'idle', to: 'hover', conditions: [] },
        { id: 'c2', from: 'hover', to: 'tap', conditions: [] },
      ]),
      { resolve },
    );
    m.step(0);
    expect(m.current()).toBe('hover'); // c1 took; c2 may not cascade in the same step
    m.step(0.1);
    expect(m.current()).toBe('tap');
  });

  it('priority is document order, first-match-wins; any-state edges rank after explicit edges', () => {
    const { resolve } = targetSigs('btn/x');
    const m = createMachine(
      buttonDoc([
        { id: 'g1', from: '*', to: 'tap', conditions: [{ input: 'hovered', is: true }] },
        { id: 'e1', from: 'idle', to: 'hover', conditions: [{ input: 'hovered', is: true }] },
      ]),
      { resolve, initialInputs: { hovered: true } },
    );
    m.step(0);
    expect(m.current()).toBe('hover'); // explicit e1 wins despite g1 appearing first
  });

  it("a '*' edge never matches the current state unless allowSelf, which restarts it", () => {
    const { sig, resolve } = targetSigs('btn/x');
    const make = (allowSelf: boolean) =>
      createMachine(
        buttonDoc([{ id: 'g', from: '*', to: 'tap', allowSelf, conditions: [{ trigger: 'press' }] }]),
        { resolve },
      );
    const m1 = make(false);
    m1.step(0);
    m1.fire('press');
    m1.step(0.1); // enter tap, anchored at 0.1
    expect(m1.current()).toBe('tap');
    m1.fire('press');
    m1.step(0.41); // no self-restart: local 0.31 → 500 + (0.31/0.5)·100
    expect(sig('btn/x')()).toBeCloseTo(562, 9);
    m1.dispose();

    const m2 = make(true);
    m2.step(0);
    m2.fire('press');
    m2.step(0.1);
    m2.fire('press');
    m2.step(0.41); // self-restart: tap re-anchors, local 0
    expect(sig('btn/x')()).toBe(500);
    m2.dispose();
  });

  it('exitTime is a window-guard on the source playhead; looping states reopen it each loop', () => {
    const { resolve } = targetSigs('btn/x');
    // non-looping: "when finished" idiom
    const m = createMachine(
      buttonDoc([{ id: 'f', from: 'idle', to: 'hover', conditions: [], exitTime: 1 }]),
      { resolve },
    );
    m.step(0);
    m.step(0.99);
    expect(m.current()).toBe('idle');
    m.step(1.01);
    expect(m.current()).toBe('hover');
    m.dispose();

    // looping: window [0.5·d, d) reopens each loop
    const loopDoc = buttonDoc(
      [{ id: 'w', from: 'idle', to: 'hover', conditions: [{ input: 'hovered', is: true }], exitTime: 0.5 }],
      { idle: { timeline: tlIdle, loop: true }, hover: { timeline: tlHover }, tap: { timeline: tlTap } },
    );
    const m2 = createMachine(loopDoc, { resolve });
    m2.step(0);
    m2.input('hovered').set(true);
    m2.step(1.2); // wrapped local 0.2 < 0.5: window closed again
    expect(m2.current()).toBe('idle');
    m2.step(1.7); // wrapped local 0.7: open
    expect(m2.current()).toBe('hover');
    m2.dispose();
  });

  it("onEnter: 'restart' rewinds on re-entry; 'resume' picks up where it left off (§A.1)", () => {
    const { sig, resolve } = targetSigs('btn/x');
    const run = (onEnter: 'restart' | 'resume') => {
      const doc = buttonDoc(T_HOVER, {
        idle: { timeline: tlIdle },
        hover: { timeline: tlHover, onEnter },
        tap: { timeline: tlTap },
      });
      const m = createMachine(doc, { resolve });
      m.step(0);
      m.input('hovered').set(true);
      m.step(0.1); // enter hover
      m.step(0.6); // hover local 0.5 → x = 250
      m.input('hovered').set(false);
      m.step(0.7); // out: hover's saved local is 0.6
      m.input('hovered').set(true);
      m.step(0.8); // back in
      const x = sig('btn/x')() as number;
      m.dispose();
      return x;
    };
    expect(run('restart')).toBe(200); // local 0
    expect(run('resume')).toBeCloseTo(260, 9); // local 0.6 preserved across the exit
  });

  it('state rate scales the local playhead', () => {
    const { sig, resolve } = targetSigs('btn/x');
    const doc = buttonDoc(T_HOVER, {
      idle: { timeline: tlIdle, rate: 2 },
      hover: { timeline: tlHover },
      tap: { timeline: tlTap },
    });
    const m = createMachine(doc, { resolve });
    m.step(0);
    m.step(0.25); // local 0.5 at rate 2
    expect(sig('btn/x')()).toBeCloseTo(50, 9);
  });

  it('step() and fire() throw inside the read phase — same guard as signal writes (§A.5)', () => {
    const { resolve } = targetSigs('btn/x');
    const m = createMachine(buttonDoc(T_HOVER), { resolve });
    m.step(0);
    beginReadPhase();
    try {
      expect(() => m.step(1)).toThrow(WriteDuringEvaluationError);
      expect(() => m.fire('press')).toThrow(WriteDuringEvaluationError);
      expect(() => m.input('hovered').set(true)).toThrow(WriteDuringEvaluationError);
    } finally {
      endReadPhase();
    }
  });

  it('replay determinism: the same input script at the same step times is bit-identical (§A.6)', () => {
    const script = (m: ReturnType<typeof createMachine>, sig: () => unknown): unknown[] => {
      const out: unknown[] = [];
      const fps = 60;
      for (let f = 0; f <= 120; f++) {
        const now = f / fps;
        if (f === 20) m.input('hovered').set(true);
        if (f === 45) m.fire('press');
        if (f === 80) m.input('hovered').set(false);
        m.step(now);
        out.push(sig());
      }
      return out;
    };
    const docOf = (): StateMachineDoc =>
      buttonDoc([
        ...T_HOVER.map((t) => ({ ...t, duration: 0.2 })),
        { id: 't3', from: '*', to: 'tap', conditions: [{ trigger: 'press' }], duration: 0.15 },
        { id: 't4', from: 'tap', to: 'idle', conditions: [], exitTime: 1, duration: 0.1 },
      ]);
    const a = targetSigs('btn/x');
    const b = targetSigs('btn/x');
    const ra = script(createMachine(docOf(), { resolve: a.resolve }), () => a.sig('btn/x')());
    const rb = script(createMachine(docOf(), { resolve: b.resolve }), () => b.sig('btn/x')());
    expect(ra).toEqual(rb);
  });

  it('dispose() unbinds every target and makes step a no-op', () => {
    const { sig, resolve } = targetSigs('btn/x');
    const m = createMachine(buttonDoc(T_HOVER), { resolve });
    m.step(0);
    m.step(0.5);
    expect(sig('btn/x').isBound).toBe(true);
    m.dispose();
    expect(sig('btn/x').isBound).toBe(false);
    const frozen = sig('btn/x')();
    m.input('hovered').set(true);
    m.step(1);
    expect(m.current()).toBe('idle');
    expect(sig('btn/x')()).toBe(frozen);
  });
});

describe('zero-duration pose states', () => {
  it('a single-key pose state binds its value and exits on exitTime immediately', () => {
    const pose = (v: number): Timeline => timeline({ tracks: [track('btn/x', 'number', [key(0, v)])] });
    const { sig, resolve } = targetSigs('btn/x');
    const doc = buttonDoc(
      [{ id: 'go', from: 'idle', to: 'hover', conditions: [], exitTime: 1 }],
      { idle: { timeline: pose(7) }, hover: { timeline: pose(9) }, tap: { timeline: tlTap } },
    );
    const m = createMachine(doc, { resolve });
    m.step(0);
    expect(m.current()).toBe('hover'); // duration-0 source: the window is open at once
    expect(sig('btn/x')()).toBe(9);
  });
});

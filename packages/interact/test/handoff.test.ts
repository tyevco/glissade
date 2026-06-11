import { beforeEach, describe, expect, it } from 'vitest';
import {
  getValueType,
  key,
  sampleTrack,
  setDevWarning,
  signal,
  timeline,
  track,
  velocityAt,
  type BindableSignal,
  type Track,
  type Vec2,
} from '@glissade/core';
import { createMachine, type StateMachineDoc, type TransitionDoc } from '../src/index.js';

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

const idleX = track('btn/x', 'number', [key(0, 0), key(1, 300, 'easeInOutCubic')]);
const hoverX = track('btn/x', 'number', [key(0, 100), key(2, 500, 'easeOutQuad')]);

function doc(transitions: TransitionDoc[], states: StateMachineDoc['states']): StateMachineDoc {
  return {
    version: 1,
    id: 'handoff',
    inputs: { go: { type: 'boolean', default: false }, go2: { type: 'boolean', default: false }, press: { type: 'trigger' } },
    initial: 'a',
    states,
    transitions,
  };
}

describe("spring handoff (§B.2/§B.3): offset decay over the live destination", () => {
  const states = {
    a: { timeline: timeline({ tracks: [idleX] }) },
    b: { timeline: timeline({ tracks: [hoverX] }) },
  };
  const T: TransitionDoc[] = [
    { id: 's1', from: 'a', to: 'b', conditions: [{ input: 'go', is: true }], handoff: 'spring' },
  ];

  it('is C0-exact and C1-continuous at the switch, and settles onto the destination', () => {
    const { sig, resolve } = targetSigs('btn/x');
    const m = createMachine(doc(T, states), { resolve });
    const tSwitch = 0.4;
    m.step(0);
    m.input('go').set(true);
    m.step(tSwitch);

    // C0: at the switch the composite equals the outgoing curve (float-assoc rounding only)
    const xOut = sampleTrack(idleX as Track<number>, tSwitch);
    expect(sig('btn/x')()).toBeCloseTo(xOut, 9);

    // C1: forward difference across the switch matches the outgoing analytic velocity
    const vOut = velocityAt(idleX as Track<number>, tSwitch)!;
    const h = 1e-5;
    m.step(tSwitch + h);
    const vNum = ((sig('btn/x')() as number) - xOut) / h;
    expect(Math.abs(vNum - vOut)).toBeLessThan(1e-3 * (1 + Math.abs(vOut)));

    // settles onto the live destination and the steady rebind is bit-exact
    m.step(tSwitch + 5);
    expect(sig('btn/x')()).toBe(sampleTrack(hoverX as Track, 5));
    m.step(tSwitch + 5.3);
    expect(sig('btn/x')()).toBe(sampleTrack(hoverX as Track, 5.3));
  });

  it('runs per component on vec2 and lands on the destination', () => {
    const aP = track('btn/p', 'vec2', [key<Vec2>(0, [0, 0]), key<Vec2>(1, [300, -120], 'easeInOutCubic')]);
    const bP = track('btn/p', 'vec2', [key<Vec2>(0, [50, 40]), key<Vec2>(2, [500, 200], 'easeOutQuad')]);
    const { sig, resolve } = targetSigs('btn/p');
    const m = createMachine(
      doc(T, {
        a: { timeline: timeline({ tracks: [aP] }) },
        b: { timeline: timeline({ tracks: [bP] }) },
      }),
      { resolve },
    );
    m.step(0);
    m.input('go').set(true);
    m.step(0.4);
    const out = sampleTrack(aP as Track<Vec2>, 0.4);
    const got = sig('btn/p')() as Vec2;
    expect(got[0]).toBeCloseTo(out[0], 9); // C0 per component
    expect(got[1]).toBeCloseTo(out[1], 9);
    m.step(5.4);
    expect(sig('btn/p')()).toEqual(sampleTrack(bP as Track<Vec2>, 5));
  });

  it('a target absent from the entering state inertializes against its frozen switch value', () => {
    const aY = track('btn/y', 'number', [key(0, 0), key(1, 80)]);
    const { sig, resolve } = targetSigs('btn/x', 'btn/y');
    const m = createMachine(
      doc(T, {
        a: { timeline: timeline({ tracks: [idleX, aY] }) },
        b: { timeline: timeline({ tracks: [hoverX] }) }, // no btn/y
      }),
      { resolve },
    );
    m.step(0);
    m.input('go').set(true);
    m.step(0.5);
    const frozen = sampleTrack(aY as Track<number>, 0.5); // 40
    expect(sig('btn/y')()).toBeCloseTo(frozen, 9); // C0 at the switch (x0 = 0)
    m.step(0.55); // velocity carries: it glides past the frozen point...
    expect(sig('btn/y')()).not.toBe(frozen);
    m.step(6); // ...and the offset decays back to it
    expect(sig('btn/y')()).toBeCloseTo(frozen, 9);
    expect(sig('btn/y').isBound).toBe(false); // settled: frozen means unbound
  });

  it('with duration 0 and no handoff, a missing target hard-freezes at the switch value', () => {
    const aY = track('btn/y', 'number', [key(0, 0), key(1, 80)]);
    const { sig, resolve } = targetSigs('btn/x', 'btn/y');
    const m = createMachine(
      doc([{ id: 'c1', from: 'a', to: 'b', conditions: [{ input: 'go', is: true }] }], {
        a: { timeline: timeline({ tracks: [idleX, aY] }) },
        b: { timeline: timeline({ tracks: [hoverX] }) },
      }),
      { resolve },
    );
    m.step(0);
    m.input('go').set(true);
    m.step(0.5);
    expect(sig('btn/y')()).toBe(sampleTrack(aY as Track, 0.5));
    expect(sig('btn/y').isBound).toBe(false);
    m.step(2);
    expect(sig('btn/y')()).toBe(sampleTrack(aY as Track, 0.5));
  });
});

describe('decay handoff (§B.1): eased ramp with the overshoot clamp', () => {
  const pose = (target: string, v: number) => timeline({ tracks: [track(target, 'number', [key(0, v)])] });
  const aX = track('btn/x', 'number', [key(0, 0), key(1, 100)]); // v = 100 throughout

  it('without reversal, the offset decays over the full declared duration', () => {
    const { sig, resolve } = targetSigs('btn/x');
    const m = createMachine(
      doc(
        [{ id: 'd1', from: 'a', to: 'b', conditions: [{ input: 'go', is: true }], handoff: 'decay', duration: 0.5 }],
        { a: { timeline: timeline({ tracks: [aX] }) }, b: { timeline: pose('btn/x', 30) } },
      ),
      { resolve },
    );
    m.step(0);
    m.input('go').set(true);
    m.step(0.5); // out = 50, dest = 30, x0 = 20, v0 = 100 → same sign as x0: no clamp
    expect(sig('btn/x')()).toBe(50);
    m.step(0.5 + 0.25); // halfway: 30 + 20·(1 − 0.5)
    expect(sig('btn/x')()).toBeCloseTo(40, 9);
    m.step(0.5 + 0.45);
    expect(sig('btn/x')()).not.toBe(30); // still decaying at τ = 0.45 < 0.5
    m.step(0.5 + 0.55);
    expect(sig('btn/x')()).toBe(30);
  });

  it('quick reversal compensates the duration: d′ = min(d, −5x₀/v₀), no slow crawl', () => {
    const { sig, resolve } = targetSigs('btn/x');
    const m = createMachine(
      doc(
        [{ id: 'd2', from: 'a', to: 'b', conditions: [{ input: 'go', is: true }], handoff: 'decay', duration: 0.5 }],
        { a: { timeline: timeline({ tracks: [aX] }) }, b: { timeline: pose('btn/x', 52) } },
      ),
      { resolve },
    );
    m.step(0);
    m.input('go').set(true);
    m.step(0.5); // out = 50, dest = 52: x0 = −2, v0 = 100 → d′ = min(0.5, 10/100) = 0.1
    expect(sig('btn/x')()).toBe(50);
    m.step(0.5 + 0.12); // τ past d′: offset already gone, NOT still ramping toward 0.5
    expect(sig('btn/x')()).toBe(52);
  });
});

describe('lerp-only types (§B.1): blend-from-frozen, one frozen value, nothing stacks', () => {
  const aFill = track('btn/fill', 'color', [key(0, '#000000'), key(1, '#ffffff')]);
  const bFill = track('btn/fill', 'color', [key(0, '#ff0000')]);
  const states = {
    a: { timeline: timeline({ tracks: [aFill] }) },
    b: { timeline: timeline({ tracks: [bFill] }) },
  };

  it("color's type-class default blends from the frozen switch value over the transition clock", () => {
    const { sig, resolve } = targetSigs('btn/fill');
    const m = createMachine(
      doc([{ id: 'b1', from: 'a', to: 'b', conditions: [{ input: 'go', is: true }], duration: 0.3 }], states),
      { resolve },
    );
    m.step(0);
    m.input('go').set(true);
    m.step(0.5);
    const frozen = sampleTrack(aFill as Track<string>, 0.5);
    // lerp(frozen, dest, 0) at the switch — compare through the same OKLab round-trip
    expect(sig('btn/fill')()).toBe(getValueType<string>('color').lerp(frozen, '#ff0000', 0));
    m.step(0.65); // u = 0.5, linear ease
    expect(sig('btn/fill')()).toBe(getValueType<string>('color').lerp(frozen, '#ff0000', 0.5));
    m.step(0.85); // u ≥ 1: plain destination, steady
    expect(sig('btn/fill')()).toBe('#ff0000');
  });

  it("an explicit 'spring' on a lerp-only type degrades to blend-from-frozen with a dev warning (§B.6)", () => {
    const { sig, resolve } = targetSigs('btn/fill');
    const m = createMachine(
      doc(
        [{ id: 'b2', from: 'a', to: 'b', conditions: [{ input: 'go', is: true }], handoff: 'spring', duration: 0.3 }],
        states,
      ),
      { resolve },
    );
    m.step(0);
    m.input('go').set(true);
    m.step(0.5);
    expect(warnings.some((w) => w.includes("'color'") && w.includes('blend-from-frozen'))).toBe(true);
    const frozen = sampleTrack(aFill as Track<string>, 0.5);
    m.step(0.65);
    expect(sig('btn/fill')()).toBe(getValueType<string>('color').lerp(frozen, '#ff0000', 0.5));
  });
});

describe('re-interruption (§B.4): bounded at one offset, momentum carries through every hop', () => {
  it('a second interruption reads the in-flight composite analytically — C0 exact, C1 continuous', () => {
    const cX = track('btn/x', 'number', [key(0, 700), key(1.5, 50, 'easeInOutCubic')]);
    const states = {
      a: { timeline: timeline({ tracks: [idleX] }) },
      b: { timeline: timeline({ tracks: [hoverX] }) },
      c: { timeline: timeline({ tracks: [cX] }) },
    };
    const T: TransitionDoc[] = [
      { id: 'r1', from: 'a', to: 'b', conditions: [{ input: 'go', is: true }], handoff: 'spring' },
      { id: 'r2', from: 'b', to: 'c', conditions: [{ input: 'go2', is: true }], handoff: 'spring' },
    ];
    // reference machine: same doc, but never interrupted a second time
    const mk = () => {
      const t = targetSigs('btn/x');
      return { ...t, m: createMachine(doc(T, states), { resolve: t.resolve }) };
    };
    const live = mk();
    const ref = mk();
    for (const { m } of [live, ref]) {
      m.step(0);
      m.input('go').set(true);
      m.step(0.4); // first handoff, still settling at 0.6
    }
    live.m.input('go2').set(true);
    const t2 = 0.6;
    live.m.step(t2);
    ref.m.step(t2);
    // C0: the second composite starts exactly where the first composite was
    const atT2 = ref.sig('btn/x')() as number;
    expect(live.sig('btn/x')()).toBeCloseTo(atT2, 9);
    // C1: velocity across the second switch matches the in-flight composite's velocity
    const h = 1e-5;
    live.m.step(t2 + h);
    ref.m.step(t2 + h);
    const vLive = ((live.sig('btn/x')() as number) - atT2) / h;
    const vRef = ((ref.sig('btn/x')() as number) - atT2) / h;
    expect(Math.abs(vLive - vRef)).toBeLessThan(1e-2 * (1 + Math.abs(vRef)));
    // and it settles onto the final destination
    live.m.step(t2 + 6);
    expect(live.sig('btn/x')()).toBe(sampleTrack(cX as Track, 1.5));
  });
});

describe('interruptible: false (§B.4): evaluation skipped, the trigger queue held — never dropped', () => {
  it('blocks all transitions while in flight and delivers held triggers at the first evaluated step', () => {
    const pose = (v: number) => timeline({ tracks: [track('btn/x', 'number', [key(0, v)])] });
    const states = {
      a: { timeline: timeline({ tracks: [idleX] }) },
      b: { timeline: timeline({ tracks: [hoverX] }) },
      tap: { timeline: pose(900) },
    };
    const T: TransitionDoc[] = [
      {
        id: 'n1',
        from: 'a',
        to: 'b',
        conditions: [{ input: 'go', is: true }],
        handoff: 'decay',
        duration: 0.3,
        interruptible: false,
      },
      { id: 'n2', from: '*', to: 'tap', conditions: [{ trigger: 'press' }] },
    ];
    const { resolve } = targetSigs('btn/x');
    const m = createMachine(doc(T, states), { resolve });
    m.step(0);
    m.input('go').set(true);
    m.step(0.1); // n1 takes; in flight until 0.4
    expect(m.current()).toBe('b');
    m.fire('press');
    m.step(0.2); // blocked: not taken, not dropped
    expect(m.current()).toBe('b');
    m.step(0.3); // still blocked
    expect(m.current()).toBe('b');
    m.step(0.45); // settle passed: the held trigger is delivered this step
    expect(m.current()).toBe('tap');
  });

  it('an interruptible spring transition can be re-interrupted mid-flight (the default)', () => {
    const states = {
      a: { timeline: timeline({ tracks: [idleX] }) },
      b: { timeline: timeline({ tracks: [hoverX] }) },
    };
    const T: TransitionDoc[] = [
      { id: 'i1', from: 'a', to: 'b', conditions: [{ input: 'go', is: true }], handoff: 'spring' },
      { id: 'i2', from: 'b', to: 'a', conditions: [{ input: 'go', is: false }], handoff: 'spring' },
    ];
    const { resolve } = targetSigs('btn/x');
    const m = createMachine(doc(T, states), { resolve });
    m.step(0);
    m.input('go').set(true);
    m.step(0.4);
    m.input('go').set(false);
    m.step(0.5); // hover-out mid hover-in: the headline case takes immediately
    expect(m.current()).toBe('a');
  });
});

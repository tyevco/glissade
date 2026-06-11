import { describe, expect, it } from 'vitest';
import { key, sampleTrack, signal, timeline, track, type BindableSignal, type Track } from '@glissade/core';
import { createScene, Rect } from '@glissade/scene';
import {
  createMachine,
  hoverMachine,
  machineBuilder,
  MachineValidationError,
  pose,
  pressMachine,
  type StateMachineDoc,
} from '../src/index.js';

describe('pose (§C.7): just values — a one-key timeline', () => {
  it('compiles each entry to a single-key track with the inferred type', () => {
    const tl = pose({ 'btn/scale': [1.1, 1.1], 'btn/opacity': 0.8, 'btn/fill': '#ff0000', 'btn/label': 'hi' });
    expect(tl.version).toBe(1);
    const byTarget = Object.fromEntries(tl.tracks.map((t) => [t.target, t]));
    expect(byTarget['btn/scale']!.type).toBe('vec2');
    expect(byTarget['btn/opacity']!.type).toBe('number');
    expect(byTarget['btn/fill']!.type).toBe('color');
    expect(byTarget['btn/label']!.type).toBe('string');
    expect(byTarget['btn/opacity']!.keys).toEqual([{ t: 0, value: 0.8 }]);
  });
});

describe('machineBuilder (§C.7): builder output IS the document', () => {
  const tlTap = timeline({ tracks: [track('btn/x', 'number', [key(0, 0), key(0.3, 10)])] });

  it('produces exactly the hand-authored §A.4 document shape', () => {
    const doc = machineBuilder('button')
      .input('hovered', 'boolean', false)
      .input('level', 'number')
      .trigger('press')
      .state('idle', pose({ 'btn/x': 0 }))
      .state('hover', { timeline: pose({ 'btn/x': 5 }), loop: true, onEnter: 'resume' })
      .state('tap', tlTap)
      .initial('idle')
      .transition('idle', 'hover', { when: { input: 'hovered', is: true }, duration: 0.15, handoff: 'spring' })
      .transition('hover', 'idle', { when: { input: 'hovered', is: false }, duration: 0.15 })
      .transition('*', 'tap', { when: { trigger: 'press' } })
      .transition('tap', 'idle', { exitTime: 1, duration: 0.1, id: 'finish' })
      .build();

    const expected: StateMachineDoc = {
      version: 1,
      id: 'button',
      inputs: {
        hovered: { type: 'boolean', default: false },
        level: { type: 'number' },
        press: { type: 'trigger' },
      },
      initial: 'idle',
      states: {
        idle: { timeline: pose({ 'btn/x': 0 }) },
        hover: { timeline: pose({ 'btn/x': 5 }), loop: true, onEnter: 'resume' },
        tap: { timeline: tlTap },
      },
      transitions: [
        { id: 'idle->hover#0', from: 'idle', to: 'hover', conditions: [{ input: 'hovered', is: true }], duration: 0.15, handoff: 'spring' },
        { id: 'hover->idle#1', from: 'hover', to: 'idle', conditions: [{ input: 'hovered', is: false }], duration: 0.15 },
        { id: '*->tap#2', from: '*', to: 'tap', conditions: [{ trigger: 'press' }] },
        { id: 'finish', from: 'tap', to: 'idle', conditions: [], exitTime: 1, duration: 0.1 },
      ],
    };
    expect(doc).toEqual(expected);
    expect(JSON.parse(JSON.stringify(doc))).toEqual(expected); // fully serializable
  });

  it('defaults initial to the first declared state and validates on build', () => {
    const doc = machineBuilder('m')
      .input('go', 'boolean')
      .state('a', pose({ 'n/x': 0 }))
      .state('b', pose({ 'n/x': 1 }))
      .transition('a', 'b', { when: { input: 'go', is: true } })
      .build();
    expect(doc.initial).toBe('a');

    expect(() =>
      machineBuilder('bad')
        .state('a', pose({ 'n/x': 0 }))
        .transition('a', 'a', { when: { input: 'missing', is: true } as never })
        .build(),
    ).toThrow(MachineValidationError);
  });

  it('built machines run: a buildable toggle transitions like a hand-written one', () => {
    const sig = signal<unknown>(0);
    const doc = machineBuilder('t')
      .input('on', 'boolean')
      .state('off', pose({ 'n/x': 0 }))
      .state('on', pose({ 'n/x': 10 }))
      .transition('off', 'on', { when: { input: 'on', is: true } })
      .transition('on', 'off', { when: { input: 'on', is: false } })
      .build();
    const m = createMachine(doc, { resolve: (t) => (t === 'n/x' ? (sig as BindableSignal<unknown>) : undefined) });
    m.step(0);
    expect(sig()).toBe(0);
    m.input('on').set(true);
    m.step(0.1);
    expect(m.current()).toBe('on');
    expect(sig()).toBe(10);
  });
});

describe('presets (§C.7): one-liner hover/press machines', () => {
  class FakeEl {
    handlers = new Map<string, (ev: unknown) => void>();
    addEventListener(t: string, fn: (ev: unknown) => void): void {
      this.handlers.set(t, fn);
    }
    removeEventListener(t: string): void {
      this.handlers.delete(t);
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 100 };
    }
    fire(type: string, x: number, y: number): void {
      this.handlers.get(type)?.({ clientX: x, clientY: y, pointerType: 'mouse', isPrimary: true, button: 0 });
    }
  }

  it('hoverMachine: doc shape + live wiring drive the pose swap', () => {
    const spec = hoverMachine('btn', { from: { opacity: 0.8 }, to: { opacity: 1 }, duration: 0.2 });
    expect(spec.doc.id).toBe('hover-btn');
    expect(spec.doc.initial).toBe('idle');
    expect(Object.keys(spec.doc.states)).toEqual(['idle', 'hover']);
    const idleTl = spec.doc.states['idle']!.timeline as { tracks: Track[] };
    expect(idleTl.tracks[0]!.target).toBe('btn/opacity');

    const scene = createScene({
      size: { w: 100, h: 100 },
      children: [new Rect({ id: 'btn', width: 40, height: 40, position: [50, 50], fill: '#fff' })],
    });
    const machine = createMachine(spec.doc, { resolve: scene.resolveTarget });
    const el = new FakeEl();
    const undo = spec.wire!({ scene, machine, element: el as unknown as Element });
    machine.step(0);
    el.fire('pointermove', 50, 50); // over the rect
    machine.step(0.1);
    expect(machine.current()).toBe('hover');
    machine.step(1); // settle past the blend
    const opacity = scene.nodes.get('btn')!.opacity();
    expect(opacity).toBe(1);
    el.fire('pointermove', 5, 5); // off
    machine.step(1.1);
    expect(machine.current()).toBe('idle');
    (undo as () => void)();
    expect(el.handlers.size).toBe(0);
  });

  it('pressMachine wires press semantics; a Node without an id throws', () => {
    const spec = pressMachine('btn', { from: { fill: '#222222' }, to: { fill: '#444444' } });
    expect(spec.doc.id).toBe('press-btn');
    expect(spec.doc.inputs).toEqual({ pressed: { type: 'boolean' } });
    expect(() => hoverMachine(new Rect({}), { from: {}, to: {} })).toThrow(/explicit id/);
  });
});

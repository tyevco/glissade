import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compileTimeline, key, timeline, track } from '@glissade/core';
import { Circle, createScene, Rect, type SceneModule } from '@glissade/scene';
import { createMachine, recordTrace, type MachineSpec, type StateMachineDoc } from '@glissade/interact';
import { MachineExportError, resolveRenderDoc } from '../src/machines.js';

const tmp = mkdtempSync(join(tmpdir(), 'glissade-machines-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const tlIdle = timeline({ tracks: [track('btn/radius', 'number', [key(0, 30)])] });
const tlHover = timeline({ tracks: [track('btn/radius', 'number', [key(0, 30), key(0.5, 40)])] });

const DOC: StateMachineDoc = {
  version: 1,
  id: 'button',
  inputs: { hovered: { type: 'boolean', default: false } },
  initial: 'idle',
  states: { idle: { timeline: tlIdle }, hover: { timeline: tlHover } },
  transitions: [
    { id: 't1', from: 'idle', to: 'hover', conditions: [{ input: 'hovered', is: true }], duration: 0.1 },
    { id: 't2', from: 'hover', to: 'idle', conditions: [{ input: 'hovered', is: false }], duration: 0.1 },
  ],
};

function makeModule(ambientTarget = 'bg/opacity'): SceneModule & { machines: MachineSpec[] } {
  return {
    createScene: () =>
      createScene({
        size: { w: 100, h: 100 },
        children: [
          new Rect({ id: 'bg', width: 100, height: 100, position: [50, 50], fill: '#222' }),
          new Circle({ id: 'btn', radius: 30, position: [50, 50], fill: '#3b82f6' }),
        ],
      }),
    timeline: timeline({ duration: 2, tracks: [track(ambientTarget, 'number', [key(0, 0.9), key(2, 1)])] }),
    machines: [{ doc: DOC }],
  };
}

describe('resolveRenderDoc (§A.6): machines need an export story', () => {
  it('passes plain modules through; --trace/--state on them is an error', () => {
    const mod = makeModule();
    const plain: SceneModule = { createScene: mod.createScene, timeline: mod.timeline };
    const scene = plain.createScene();
    expect(resolveRenderDoc(plain, scene, {})).toBe(plain.timeline);
    expect(() => resolveRenderDoc(plain, scene, { state: 'idle' })).toThrow(/declares no machines/);
  });

  it('machines with neither --trace nor --state are a build error listing the routes', () => {
    const mod = makeModule();
    expect(() => resolveRenderDoc(mod, mod.createScene(), {})).toThrow(MachineExportError);
    expect(() => resolveRenderDoc(mod, mod.createScene(), {})).toThrow(/--trace/);
    expect(() => resolveRenderDoc(mod, mod.createScene(), {})).toThrow(/--state/);
  });

  it('rejects an ambient timeline that animates a machine target (§A.1)', () => {
    const mod = makeModule('btn/radius'); // collides with the machine
    expect(() => resolveRenderDoc(mod, mod.createScene(), { state: 'idle' })).toThrow(/animated by both/);
  });

  it("--state merges one state's timeline over the ambient document at the state's duration", () => {
    const mod = makeModule();
    expect(() => resolveRenderDoc(mod, mod.createScene(), { state: 'nope' })).toThrow(/no such state/);
    const doc = resolveRenderDoc(mod, mod.createScene(), { state: 'hover' });
    const compiled = compileTimeline(doc);
    expect(compiled.duration).toBe(0.5); // the state's length wins, not the 2 s ambient
    expect([...compiled.tracks.keys()].sort()).toEqual(['bg/opacity', 'btn/radius']);
  });

  it('--trace replays, bakes, and merges; the hash must match unless --force', () => {
    const mod = makeModule();
    // record a take against an identical machine
    const recScene = mod.createScene();
    const m = createMachine(DOC, { resolve: (t) => recScene.resolveTarget(t) });
    let now = 0;
    const rec = recordTrace(m, { fps: 30, now: () => now });
    now = 0.3;
    m.input('hovered').set(true);
    now = 0.9;
    m.input('hovered').set(false);
    const trace = rec.stop();
    const tracePath = join(tmp, 'take1.trace.json');
    writeFileSync(tracePath, JSON.stringify(trace));

    const doc = resolveRenderDoc(mod, mod.createScene(), { trace: tracePath });
    const compiled = compileTimeline(doc);
    expect(compiled.duration).toBe(2); // max(ambient 2 s, baked 1.9 s)
    expect(compiled.tracks.has('btn/radius')).toBe(true); // the baked machine track
    expect(compiled.tracks.has('bg/opacity')).toBe(true); // ambient intact

    const stale = { ...trace, machineHash: 'deadbeef' };
    const stalePath = join(tmp, 'stale.trace.json');
    writeFileSync(stalePath, JSON.stringify(stale));
    expect(() => resolveRenderDoc(mod, mod.createScene(), { trace: stalePath })).toThrow(/matches none/);
    const forced = resolveRenderDoc(mod, mod.createScene(), { trace: stalePath, force: true });
    expect(compileTimeline(forced).tracks.has('btn/radius')).toBe(true);
  });
});

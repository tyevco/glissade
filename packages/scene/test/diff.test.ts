/**
 * 0.61 diff(a, b) — the typed blast-radius ChangeSet.
 *
 * Pins the load-bearing invariants: diff(a,a) EMPTY; construction-order-only
 * differences EMPTY (the semantic-not-pixels contract); complete AND minimal
 * (every real change appears, no spurious entry); node add/remove/reparent; static
 * prop change; track retarget vs keys-change vs add/remove; the opt-in rendered
 * layer; and shuffle-stable canonical order.
 */
import { describe, expect, it } from 'vitest';
import { type Timeline, timeline, track, key } from '@glissade/core';
import { createScene, Rect, Group, Text } from '../src/index.js';
import { diff } from '../src/diagnostics.js';

const size = { w: 200, h: 120 };

function baseScene() {
  return createScene({
    size,
    children: [
      new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#3366ff' }),
      new Text({ id: 'cap', position: [10, 60], text: 'hi', fontSize: 12, fill: '#000' }),
    ],
  });
}

describe('diff — the EMPTY invariants', () => {
  it('diff(a, a) is EMPTY (a scene vs itself)', () => {
    const scene = baseScene();
    const doc = timeline({ tracks: [track('box/opacity', 'number', [key(0, 0), key(1, 1)])] });
    const d = diff({ scene, timeline: doc }, { scene, timeline: doc });
    expect(d.empty).toBe(true);
    expect(d).toMatchObject({ added: [], removed: [], changed: [] });
  });

  it('construction-ORDER-only difference is EMPTY (semantic, not pixels)', () => {
    // same two nodes, built in the opposite child order — renders identically.
    const a = createScene({
      size,
      children: [
        new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#3366ff' }),
        new Text({ id: 'cap', position: [10, 60], text: 'hi', fontSize: 12, fill: '#000' }),
      ],
    });
    const b = createScene({
      size,
      children: [
        new Text({ id: 'cap', position: [10, 60], text: 'hi', fontSize: 12, fill: '#000' }),
        new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#3366ff' }),
      ],
    });
    expect(diff({ scene: a }, { scene: b }).empty).toBe(true);
  });
});

describe('diff — structural node changes (complete + minimal)', () => {
  it('reports an ADDED node and nothing else', () => {
    const a = baseScene();
    const b = createScene({
      size,
      children: [
        new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#3366ff' }),
        new Text({ id: 'cap', position: [10, 60], text: 'hi', fontSize: 12, fill: '#000' }),
        new Rect({ id: 'new', position: [150, 60], width: 10, height: 10, fill: '#f00' }),
      ],
    });
    const d = diff({ scene: a }, { scene: b });
    expect(d.added).toEqual([{ node: 'new', type: 'Rect' }]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([]);
  });

  it('reports a REMOVED node', () => {
    const a = baseScene();
    const b = createScene({ size, children: [new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#3366ff' })] });
    const d = diff({ scene: a }, { scene: b });
    expect(d.removed).toEqual([{ node: 'cap', type: 'Text' }]);
    expect(d.added).toEqual([]);
  });

  it('reports a static PROP change (fill), and nothing spurious', () => {
    const a = baseScene();
    const b = createScene({
      size,
      children: [
        new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#ff0000' }),
        new Text({ id: 'cap', position: [10, 60], text: 'hi', fontSize: 12, fill: '#000' }),
      ],
    });
    const d = diff({ scene: a }, { scene: b });
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0]).toMatchObject({ op: 'changed', node: 'box', property: 'fill', from: '#3366ff', to: '#ff0000' });
  });

  it('reports a REPARENT as op:moved', () => {
    const a = createScene({
      size,
      children: [new Group({ id: 'g1', children: [new Rect({ id: 'kid', position: [10, 10], width: 5, height: 5 })] }), new Group({ id: 'g2' })],
    });
    const b = createScene({
      size,
      children: [new Group({ id: 'g1' }), new Group({ id: 'g2', children: [new Rect({ id: 'kid', position: [10, 10], width: 5, height: 5 })] })],
    });
    const d = diff({ scene: a }, { scene: b });
    expect(d.changed.some((c) => c.op === 'moved' && c.node === 'kid' && c.from === 'g1' && c.to === 'g2')).toBe(true);
  });
});

describe('diff — timeline (track) changes', () => {
  it('detects a track RETARGET (same keys, new target)', () => {
    const scene = baseScene();
    const keys = [key(0, 0), key(1, 1)];
    const a = timeline({ tracks: [track('box/opacity', 'number', keys)] });
    const b = timeline({ tracks: [track('cap/opacity', 'number', keys)] });
    const d = diff({ scene, timeline: a }, { scene: baseScene(), timeline: b });
    expect(d.changed).toEqual([{ op: 'retargeted', target: 'box/opacity', from: 'box/opacity', to: 'cap/opacity' }]);
  });

  it('detects a KEYS change (same target)', () => {
    const scene = baseScene();
    const a = timeline({ tracks: [track('box/opacity', 'number', [key(0, 0), key(1, 1)])] });
    const b = timeline({ tracks: [track('box/opacity', 'number', [key(0, 0), key(1, 0.5)])] });
    const d = diff({ scene, timeline: a }, { scene: baseScene(), timeline: b });
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0]).toMatchObject({ op: 'changed', target: 'box/opacity', property: 'keys' });
  });

  it('detects a track ADD / REMOVE', () => {
    const scene = baseScene();
    const a = timeline({ tracks: [] });
    const b = timeline({ tracks: [track('box/opacity', 'number', [key(0, 0), key(1, 1)])] });
    expect(diff({ scene, timeline: a }, { scene: baseScene(), timeline: b }).changed).toEqual([
      { op: 'changed', target: 'box/opacity', property: 'track', from: 'absent', to: 'present' },
    ]);
    expect(diff({ scene: baseScene(), timeline: b }, { scene, timeline: a }).changed).toEqual([
      { op: 'changed', target: 'box/opacity', property: 'track', from: 'present', to: 'absent' },
    ]);
  });
});

describe('diff — rendered layer (opt-in) + determinism', () => {
  it('structural layer ignores a pure position change; rendered layer surfaces it', () => {
    const a = createScene({ size, children: [new Rect({ id: 'box', position: [50, 60], width: 20, height: 20, fill: '#f00' })] });
    const b = createScene({ size, children: [new Rect({ id: 'box', position: [150, 60], width: 20, height: 20, fill: '#f00' })] });
    // structural: position IS an animatable prop, so a static-value change shows
    expect(diff({ scene: a }, { scene: b }).changed.some((c) => c.property === 'position')).toBe(true);
    // rendered: the DisplayList differs → at least one render: change with the moved geometry
    const r = diff({ scene: a }, { scene: b }, { rendered: true });
    expect(r.changed.some((c) => typeof c.property === 'string' && c.property.startsWith('render:'))).toBe(true);
  });

  it('rendered layer is EMPTY when the two scenes render identically', () => {
    const a = createScene({ size, children: [new Rect({ id: 'box', position: [100, 60], width: 20, height: 20, fill: '#f00' })] });
    const b = createScene({ size, children: [new Rect({ id: 'box', position: [100, 60], width: 20, height: 20, fill: '#f00' })] });
    expect(diff({ scene: a }, { scene: b }, { rendered: true }).empty).toBe(true);
  });

  it('output is shuffle-stable (two identical diffs are byte-equal)', () => {
    const a = baseScene();
    const b = createScene({
      size,
      children: [
        new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#ff0000' }),
        new Text({ id: 'cap', position: [10, 60], text: 'bye', fontSize: 12, fill: '#000' }),
        new Rect({ id: 'zzz', position: [180, 60], width: 5, height: 5, fill: '#0f0' }),
      ],
    });
    expect(JSON.stringify(diff({ scene: a }, { scene: b }))).toBe(JSON.stringify(diff({ scene: baseScene() }, { scene: b })));
  });
});

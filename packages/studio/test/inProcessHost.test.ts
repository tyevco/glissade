/**
 * The in-process StudioHost (§6.4): clone-safe data methods, patch-based edits
 * routed through the §6.3 engine, and undo via the returned inverse.
 */

import { describe, expect, it, vi } from 'vitest';
import { key, timeline, type Timeline } from '@glissade/core';
import { createScene, Rect } from '@glissade/scene';
import { createInProcessHost } from '../src/inProcessHost.js';

function setup() {
  const scene = createScene({
    size: { w: 100, h: 100 },
    children: [new Rect({ id: 'box', width: 10, height: 10, fill: '#fff' })],
  });
  const code: Timeline = timeline((tl) => {
    tl.to('box/opacity', 1, { duration: 1 });
  });
  const host = createInProcessHost({ scene, codeTimeline: code });
  return { scene, code, host };
}

describe('createInProcessHost (§6.4)', () => {
  it('getSceneTree lists nodes with id/type/props; clone-safe; a code-only prop is not yet editable', () => {
    const { host } = setup();
    const tree = host.getSceneTree();
    const box = tree.find((n) => n.id === 'box')!;
    expect(box.type).toBe('Rect');
    expect(box.props.map((p) => p.name)).toContain('opacity');
    expect(box.props.find((p) => p.name === 'opacity')!.editable).toBe(false);
    expect(structuredClone(tree)).toEqual(tree);
  });

  it('getTimeline returns a clone-safe MergedTimeline carrying orphans', () => {
    const { host } = setup();
    const t = host.getTimeline();
    expect(t.orphans).toEqual({});
    expect(t.tracks.some((tr) => tr.target === 'box/opacity')).toBe(true);
    expect(structuredClone(t)).toEqual(t);
  });

  it('applyPatch routes through the engine, fires doc-patched, returns a clone-safe inverse; getTimeline reflects it', () => {
    const { host } = setup();
    const patched = vi.fn();
    host.on('doc-patched', patched);
    const r = host.applyPatch([
      { op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [key(0, 0), key(1, 0.5)], baseHash: null },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(patched).toHaveBeenCalledOnce();
    expect(structuredClone(r)).toEqual(r);
    const merged = host.getTimeline().tracks.find((t) => t.target === 'box/opacity')!;
    expect(merged.editable).toBe(true); // now an editor-owned overlay
  });

  it('a code-only track edit seeds from the baseline; undo via the inverse restores pure code (keys keep stable ids)', () => {
    const { host } = setup();
    const r = host.applyPatch([{ op: 'moveKey', timelineId: 'main', target: 'box/opacity', id: 'k0', t: 0.25 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inverse).toEqual([{ op: 'removeTrack', timelineId: 'main', target: 'box/opacity' }]);
    expect(host.getTimeline().tracks.find((t) => t.target === 'box/opacity')!.keys.every((k) => typeof k.id === 'string')).toBe(true);
    const back = host.applyPatch(r.inverse);
    expect(back.ok).toBe(true);
    // back to the code track — no longer an editable overlay
    expect(host.getTimeline().tracks.find((t) => t.target === 'box/opacity')!.editable).not.toBe(true);
  });

  it('setPlayhead writes the scene playhead and fires playhead-moved', () => {
    const { scene, host } = setup();
    const moved = vi.fn();
    host.on('playhead-moved', moved);
    host.setPlayhead(0.7);
    expect(scene.playhead.peek()).toBeCloseTo(0.7, 9);
    expect(moved).toHaveBeenCalledWith(0.7);
  });

  it('subscribeSignal bridges a resolvable path to the playhead and no-ops an unknown one', () => {
    const { host } = setup();
    const cb = vi.fn();
    const unsub = host.subscribeSignal('box/opacity', cb);
    host.setPlayhead(0.5);
    expect(cb).toHaveBeenCalled();
    unsub();
    expect(typeof host.subscribeSignal('ghost/x', cb)).toBe('function');
  });
});

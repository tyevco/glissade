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

describe('scrub() — §6.3 capture / commit / discard', () => {
  it('capture leaves the committed doc untouched; the overlay reflects the captured edit', () => {
    const { host } = setup();
    const patched = vi.fn();
    host.on('doc-patched', patched);
    const s = host.scrub();
    expect(s.active).toBe(true);
    // capture a whole-track set (the drag path's per-tick shape)
    const ok = s.capture([
      { op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [key(0.25, 0)], baseHash: null },
    ]);
    expect(ok).toBe(true);
    // committed doc unchanged during capture (no doc-patched, getDoc null)
    expect(patched).not.toHaveBeenCalled();
    expect(host.getDoc()).toBeNull();
    // the overlay carries the captured edit — what the viewport previews
    const overlay = s.overlayDoc()!;
    expect(overlay.timelines.main!.tracks['box/opacity']!.keys[0]!.t).toBeCloseTo(0.25, 9);
  });

  it('capture → commit folds in ONE transaction: exactly one inverse, committed doc byte-identical to the equivalent direct edit', () => {
    // the parity gate (§6.3): a scrub of N ticks must persist the SAME bytes a
    // single direct applyPatch of the final state would — files/undo never diverge.
    const direct = setup().host;
    const directResult = direct.applyPatch([
      { op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [key(0, 0), key(1, 0.5)], baseHash: null },
    ]);
    expect(directResult.ok).toBe(true);
    if (!directResult.ok) return;

    const scrubbed = setup().host;
    const s = scrubbed.scrub();
    // multiple ticks: an intermediate state, then the final one (last set wins)
    s.capture([{ op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [key(0, 0), key(0.4, 0.5)], baseHash: null }]);
    s.capture([{ op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [key(0, 0), key(1, 0.5)], baseHash: null }]);
    const committed = s.commit()!;
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    // ONE undo entry (one snapshot-restore per touched track — here, one track)
    expect(committed.inverse).toHaveLength(1);
    // byte-identical committed doc + identical inverse vs. the direct edit
    expect(committed.doc).toEqual(directResult.doc);
    expect(committed.inverse).toEqual(directResult.inverse);
    expect(scrubbed.getDoc()).toEqual(direct.getDoc());
    expect(s.active).toBe(false);
  });

  it('a fine-grained moveKey scrub commits byte-identical to the same direct moveKey', () => {
    // seed an editable track on both hosts identically
    const seed = (host: ReturnType<typeof setup>['host']) =>
      host.applyPatch([{ op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [key(0, 0), key(1, 0.5)], baseHash: null }]);

    const direct = setup().host;
    seed(direct);
    const directIds = direct.getTimeline().tracks.find((t) => t.target === 'box/opacity')!.keys.map((k) => k.id!);
    const directResult = direct.applyPatch([{ op: 'moveKey', timelineId: 'main', target: 'box/opacity', id: directIds[1]!, t: 0.75 }]);
    expect(directResult.ok).toBe(true);

    const scrubbed = setup().host;
    seed(scrubbed);
    const ids = scrubbed.getTimeline().tracks.find((t) => t.target === 'box/opacity')!.keys.map((k) => k.id!);
    const s = scrubbed.scrub();
    // two ticks of the SAME key (id-addressed): 0.6 then 0.75
    s.capture([{ op: 'moveKey', timelineId: 'main', target: 'box/opacity', id: ids[1]!, t: 0.6 }]);
    s.capture([{ op: 'moveKey', timelineId: 'main', target: 'box/opacity', id: ids[1]!, t: 0.75 }]);
    const committed = s.commit()!;
    expect(committed.ok).toBe(true);
    if (!committed.ok || !directResult.ok) return;
    expect(committed.inverse).toHaveLength(1);
    expect(scrubbed.getDoc()).toEqual(direct.getDoc());
    expect(committed.inverse).toEqual(directResult.inverse);
  });

  it('capture → discard is a no-op: committed doc + undo (no inverse) unchanged', () => {
    const { host } = setup();
    const patched = vi.fn();
    host.on('doc-patched', patched);
    const before = host.getDoc();
    const s = host.scrub();
    s.capture([{ op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [key(0.5, 1)], baseHash: null }]);
    s.discard();
    expect(s.active).toBe(false);
    expect(host.getDoc()).toBe(before); // identity unchanged — never folded in
    expect(patched).not.toHaveBeenCalled(); // discard fires no doc-patched
    // a commit after discard yields nothing (no inverse to push)
    expect(s.commit()).toBeNull();
  });

  it('commit with no captured patches returns null (a no-move gesture pushes no undo entry)', () => {
    const { host } = setup();
    const s = host.scrub();
    expect(s.commit()).toBeNull();
    expect(host.getDoc()).toBeNull();
  });

  it('capture rejects an invalid patch set without disturbing the overlay or committed doc', () => {
    const { host } = setup();
    const s = host.scrub();
    // a structural/un-id'd target cannot host a track (§6.5) — capture must fail
    const ok = s.capture([{ op: 'setTrackKeys', timelineId: 'main', target: '~Group.0/opacity', type: 'number', keys: [key(0, 0)], baseHash: null }]);
    expect(ok).toBe(false);
    expect(s.overlayDoc()).toBeNull(); // overlay still the committed (null) doc
    expect(host.getDoc()).toBeNull();
  });
});

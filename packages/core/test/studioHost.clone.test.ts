/**
 * §6.4: the StudioHost protocol must be structured-clone-safe so the same
 * interface runs in-process and over postMessage later. Patches, the patch
 * result, and the inverse are plain JSON — assert they survive structuredClone
 * unchanged. Plus the single editable-node-id rule (the 0.9 locked predicate).
 */

import { describe, expect, it } from 'vitest';
import { emptySidecar, key, spring } from '../src/index.js';
import { applyPatch, isEditableNodeId, type TimelinePatch } from '../src/studioHost.js';

describe('clone-safety of the patch protocol (§6.4)', () => {
  it('every forward patch variant survives structuredClone unchanged', () => {
    const patches: TimelinePatch[] = [
      { op: 'setTrackKeys', timelineId: 'main', target: 'a/x', type: 'number', keys: [key(0, 0), key(1, 1, spring({ stiffness: 170, damping: 26 }))], baseHash: null },
      { op: 'removeTrack', timelineId: 'main', target: 'a/x' },
      { op: 'addKey', timelineId: 'main', target: 'a/x', key: { t: 1, value: 2 } },
      { op: 'removeKey', timelineId: 'main', target: 'a/x', id: 'k0' },
      { op: 'moveKey', timelineId: 'main', target: 'a/x', id: 'k0', t: 1.25 },
      { op: 'setKeyValue', timelineId: 'main', target: 'a/x', id: 'k0', value: 7 },
      { op: 'setKeyEase', timelineId: 'main', target: 'a/x', id: 'k0', interp: 'hold' },
      { op: 'setLabel', timelineId: 'main', name: 'intro', t: 1 },
      { op: 'removeLabel', timelineId: 'main', name: 'intro' },
    ];
    for (const p of patches) expect(structuredClone(p)).toEqual(p);
  });

  it('the doc + inverse from applyPatch are clone-safe (no functions/live refs)', () => {
    const r = applyPatch(emptySidecar(), {
      op: 'setTrackKeys',
      timelineId: 'main',
      target: 'a/x',
      type: 'number',
      keys: [key(0, 0), key(1, 1, spring({ stiffness: 170, damping: 26 }))],
      baseHash: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(structuredClone(r.doc)).toEqual(r.doc);
    expect(structuredClone(r.inverse)).toEqual(r.inverse);
  });
});

describe('isEditableNodeId — the single editable-host rule (§6.4)', () => {
  it('explicit ids are editable hosts; structural/empty/missing are not', () => {
    expect(isEditableNodeId('title')).toBe(true);
    expect(isEditableNodeId('box.2')).toBe(true);
    expect(isEditableNodeId('~Group.2/Rect.0')).toBe(false); // structural fallback id
    expect(isEditableNodeId('')).toBe(false);
    expect(isEditableNodeId(undefined)).toBe(false);
  });
});

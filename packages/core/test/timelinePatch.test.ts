/**
 * TimelinePatch engine (§6.3): fine-grained forward patches by stable key id,
 * atomic batches, and snapshot-restore inverses that round-trip byte-for-byte
 * even through normalizeEditedKeys' spring re-pin (§2.7) — the determinism the
 * studio's undo stack rests on.
 */

import { describe, expect, it } from 'vitest';
import { emptySidecar, key, spring, type SidecarDoc } from '../src/index.js';
import { applyPatch, applyPatches, type BaselineLookup, type TimelinePatch } from '../src/timelinePatch.js';

const T = 'main';

function makeTrack(target: string, keys: ReturnType<typeof key>[]): TimelinePatch {
  return { op: 'setTrackKeys', timelineId: T, target, type: 'number', keys, baseHash: null };
}

describe('applyPatches — fine-grained by-id forward, snapshot inverse', () => {
  it('moveKey addresses a key by stable id; inverse restores the realized pre-state (spring re-pin safe)', () => {
    let r = applyPatch(emptySidecar(), makeTrack('box/x', [key(0, 0), key(1, 1, spring({ stiffness: 170, damping: 26 }))]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const before = r.doc.timelines[T]!.tracks['box/x']!;
    const k0 = before.keys[0]!.id!;
    const springT = before.keys[1]!.t; // already re-pinned to 0 + spring.duration by normalize

    const moved = applyPatch(r.doc, { op: 'moveKey', timelineId: T, target: 'box/x', id: k0, t: 0.5 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const after = moved.doc.timelines[T]!.tracks['box/x']!;
    expect(after.keys.find((k) => k.id === k0)!.t).toBeCloseTo(0.5, 9);
    expect(after.keys[1]!.t).toBeCloseTo(0.5 + (springT - 0), 9); // spring carried with its predecessor

    const undone = applyPatches(moved.doc, moved.inverse);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.doc.timelines[T]!.tracks['box/x']).toEqual(before); // byte-restore, incl. the re-pinned spring t
  });

  it('addKey assigns a fresh k<N> id and normalizes; undo removes exactly that key', () => {
    let r = applyPatch(emptySidecar(), makeTrack('a/x', [key(0, 0)]));
    expect(r.ok && r.doc.timelines[T]!.tracks['a/x']!.keys).toHaveLength(1);
    if (!r.ok) return;
    const added = applyPatch(r.doc, { op: 'addKey', timelineId: T, target: 'a/x', key: { t: 1, value: 10 } });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const keys = added.doc.timelines[T]!.tracks['a/x']!.keys;
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => typeof k.id === 'string')).toBe(true);
    const undone = applyPatches(added.doc, added.inverse);
    expect(undone.ok && undone.doc.timelines[T]!.tracks['a/x']!.keys).toHaveLength(1);
  });

  it('a first edit on a code-only track SEEDS from the baseline; undo is removeTrack (back to pure code)', () => {
    const baseline: BaselineLookup = (_tl, target) =>
      target === 'box/y' ? { type: 'number', keys: [key(0, 0), key(1, 1)] } : null;
    const r = applyPatch(emptySidecar(), { op: 'moveKey', timelineId: T, target: 'box/y', id: 'k0', t: 0.5 }, baseline);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.timelines[T]!.tracks['box/y']).toBeDefined();
    expect(r.doc.timelines[T]!.tracks['box/y']!.baseHash).not.toBeNull(); // recorded the code baseline
    expect(r.inverse).toEqual([{ op: 'removeTrack', timelineId: T, target: 'box/y' }]);
    const undone = applyPatches(r.doc, r.inverse);
    expect(undone.ok && undone.doc.timelines[T]!.tracks['box/y']).toBeUndefined();
  });

  it('batches are ATOMIC: one invalid patch rejects the whole batch, doc untouched', () => {
    const seed = applyPatch(emptySidecar(), makeTrack('a/x', [key(0, 0)]));
    expect(seed.ok).toBe(true);
    if (!seed.ok) return;
    const doc = seed.doc;
    const r = applyPatches(doc, [
      { op: 'addKey', timelineId: T, target: 'a/x', key: { t: 1, value: 1 } }, // valid
      { op: 'moveKey', timelineId: T, target: 'a/x', id: 'nope', t: 2 }, // invalid: no such key
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/no key 'nope'/);
    expect(doc.timelines[T]!.tracks['a/x']!.keys).toHaveLength(1); // the valid addKey was NOT committed
  });

  it('a multi-track batch yields one inverse restore per touched track', () => {
    let doc = emptySidecar();
    doc = (applyPatch(doc, makeTrack('a/x', [key(0, 0)])) as { doc: typeof doc }).doc;
    doc = (applyPatch(doc, makeTrack('b/y', [key(0, 0)])) as { doc: typeof doc }).doc;
    const r = applyPatches(doc, [
      { op: 'addKey', timelineId: T, target: 'a/x', key: { t: 1, value: 1 } },
      { op: 'setKeyValue', timelineId: T, target: 'b/y', id: 'k0', value: 9 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const targets = r.inverse.map((p) => (p as { target: string }).target).sort();
    expect(targets).toEqual(['a/x', 'b/y']);
    const undone = applyPatches(r.doc, r.inverse);
    expect(undone.ok && undone.doc).toEqual(doc); // full round-trip
  });

  it('labels: setLabel then undo restores absence; overwrite then undo restores the old value', () => {
    const add = applyPatch(emptySidecar(), { op: 'setLabel', timelineId: T, name: 'intro', t: 1 });
    expect(add.ok).toBe(true);
    if (!add.ok) return;
    expect(add.doc.timelines[T]!.labels!['intro']).toBe(1);
    expect(add.inverse).toEqual([{ op: 'removeLabel', timelineId: T, name: 'intro' }]);
    const undone = applyPatches(add.doc, add.inverse);
    expect(undone.ok && undone.doc.timelines[T]!.labels?.['intro']).toBeUndefined();
  });
});

describe('canary hardening (0.9.0-pre.0 findings)', () => {
  it('undo restores byte-exact even when the pre-edit track was UN-normalized (verbatim inverse, §finding-1)', () => {
    const sp = spring({ stiffness: 170, damping: 26 });
    // a deliberately un-normalized track: a spring key not at predecessor+duration,
    // plus a t-collision — exactly the state normalizeEditedKeys would "fix"
    const doc: SidecarDoc = {
      sidecarVersion: 2,
      timelines: {
        main: {
          tracks: {
            'box/x': {
              type: 'number',
              baseHash: null,
              keys: [
                { t: 0, value: 0, id: 'k0' },
                { t: 0.5, value: 1, ease: sp, id: 'k1' },
                { t: 0.5, value: 2, id: 'k2' },
              ],
            },
          },
        },
      },
    };
    const before = doc.timelines['main']!.tracks['box/x']!.keys;
    const r = applyPatch(doc, { op: 'setKeyValue', timelineId: 'main', target: 'box/x', id: 'k0', value: 5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const undone = applyPatches(r.doc, r.inverse);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    // byte-exact: the spring key is NOT re-pinned, the collision NOT re-nudged
    expect(undone.doc.timelines['main']!.tracks['box/x']!.keys).toEqual(before);
  });

  it('the write surface rejects structural / un-id’d targets (setTrackKeys + addKey, §finding-3)', () => {
    const d = emptySidecar();
    const bad = (t: string): TimelinePatch => ({ op: 'setTrackKeys', timelineId: 'main', target: t, type: 'number', keys: [key(0, 0)], baseHash: null });
    expect(applyPatch(d, bad('~Group.0/x')).ok).toBe(false);
    expect(applyPatch(d, bad('/x')).ok).toBe(false);
    expect(applyPatch(d, { op: 'addKey', timelineId: 'main', target: '~G.0/x', key: { t: 0, value: 0 } }).ok).toBe(false);
    expect(applyPatch(d, bad('box/x')).ok).toBe(true); // a valid explicit-id target still works
  });

  it('undo of a baseline-seeded first edit restores the original {timelines:{}} (no empty shell, §finding-5)', () => {
    const baseline: BaselineLookup = (_tl, target) =>
      target === 'box/y' ? { type: 'number', keys: [key(0, 0), key(1, 1)] } : null;
    const orig: SidecarDoc = { sidecarVersion: 2, timelines: {} };
    const r = applyPatch(orig, { op: 'addKey', timelineId: 'main', target: 'box/y', key: { t: 0.5, value: 0.5 } }, baseline);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const undone = applyPatches(r.doc, r.inverse);
    expect(undone.ok && undone.doc).toEqual(orig);
  });
});

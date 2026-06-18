import { describe, expect, it } from 'vitest';
import {
  assignKeyIds,
  compileTimeline,
  deleteSidecarTrack,
  emptySidecar,
  isEditableNodeId,
  key,
  mergeSidecar,
  mergeSidecarDetailed,
  migrateSidecar,
  sampleTrack,
  setDevWarning,
  setSidecarTrack,
  timeline,
  track,
  SidecarVersionError,
  type SidecarDoc,
  type SidecarDocV1,
} from '../src/index.js';

const code = () =>
  timeline({
    tracks: [
      track('a/x', 'number', [key(0, 0), key(1, 100)]),
      track('a/opacity', 'number', [key(0, 1)]),
    ],
    labels: { mid: 0.5 },
  });

const xBaseline = () => code().tracks[0]!.keys;

describe('sidecar merge (§6.2, v2)', () => {
  it('null/empty sidecars are identity', () => {
    expect(mergeSidecar(code(), null)).toEqual(code());
    expect(mergeSidecar(code(), emptySidecar()).tracks).toEqual(code().tracks);
  });

  it('sidecar tracks replace same-target code tracks wholesale and mark them editable', () => {
    const sc = setSidecarTrack(emptySidecar(), 'main', 'a/x', 'number', [key(0, 0), key(2, 500)], xBaseline());
    const merged = mergeSidecar(code(), sc);
    expect(sampleTrack(compileTimeline(merged).tracks.get('a/x')!, 2)).toBe(500);
    expect(merged.tracks.find((t) => t.target === 'a/x')!.editable).toBe(true);
    expect(merged.tracks.find((t) => t.target === 'a/opacity')!.keys).toEqual([key(0, 1)]);
  });

  it('editor-created track added (baseHash null); code labels win on collision (§6.2)', () => {
    const warnings: string[] = [];
    setDevWarning((m) => warnings.push(m));
    let sc = setSidecarTrack(emptySidecar(), 'main', 'a/rotation', 'number', [key(0, 0), key(1, 90)], null);
    sc = { ...sc, timelines: { main: { ...sc.timelines['main']!, labels: { mid: 0.75, end: 2 } } } };
    const merged = mergeSidecar(code(), sc);
    expect(merged.tracks.map((t) => t.target)).toContain('a/rotation');
    expect(merged.labels).toEqual({ mid: 0.5, end: 2 }); // code 'mid' wins; editor 'end' added
    expect(warnings.some((w) => w.includes('mid') && /code wins/.test(w))).toBe(true);
    setDevWarning(() => {});
  });

  it('migrates a v1 document forward and merges it', () => {
    setDevWarning(() => {});
    const v1: SidecarDocV1 = {
      sidecarVersion: 1,
      tracks: [track('a/x', 'number', [key(0, 0), key(2, 500)])],
      labels: { end: 3 },
    };
    const migrated = migrateSidecar(v1)!;
    expect(migrated.sidecarVersion).toBe(2);
    expect(migrated.timelines['main']!.tracks['a/x']!.baseHash).toBeNull();
    const merged = mergeSidecar(code(), v1); // accepts v1 directly
    expect(sampleTrack(compileTimeline(merged).tracks.get('a/x')!, 2)).toBe(500);
  });

  it('a type-changed sidecar entry is orphaned, not merged (code track survives)', () => {
    setDevWarning(() => {});
    const sc = setSidecarTrack(emptySidecar(), 'main', 'a/x', 'vec2', [key(0, [0, 0] as const)], null);
    const { timeline: merged, orphans } = mergeSidecarDetailed(code(), sc);
    expect(orphans['a/x']!.reason).toBe('type-changed');
    expect(merged.tracks.find((t) => t.target === 'a/x')!.type).toBe('number'); // code track kept
  });

  it('a sidecar track whose code track vanished is orphaned (prop-missing)', () => {
    setDevWarning(() => {});
    const sc = setSidecarTrack(emptySidecar(), 'main', 'a/gone', 'number', [key(0, 0), key(1, 1)], [key(0, 0), key(1, 1)]);
    expect(mergeSidecarDetailed(code(), sc).orphans['a/gone']!.reason).toBe('prop-missing');
  });

  it('flags drift when the code baseline changed beneath the edit (§6.2 rule 2)', () => {
    setDevWarning(() => {});
    const sc = setSidecarTrack(emptySidecar(), 'main', 'a/x', 'number', [key(0, 0), key(1, 200)], xBaseline());
    expect(mergeSidecarDetailed(code(), sc).drift).toEqual([]); // baseline unchanged
    const changed = timeline({
      tracks: [track('a/x', 'number', [key(0, 0), key(1, 999)]), track('a/opacity', 'number', [key(0, 1)])],
    });
    expect(mergeSidecarDetailed(changed, sc).drift).toContain('a/x');
  });

  it('assigns stable k<N> ids to keys', () => {
    const sc = setSidecarTrack(emptySidecar(), 'main', 'a/x', 'number', [key(0, 0), key(1, 100)], null);
    expect(sc.timelines['main']!.tracks['a/x']!.keys.map((k) => k.id)).toEqual(['k0', 'k1']);
    // inserting preserves existing ids and mints a fresh one past the max
    const withId = assignKeyIds([{ ...key(0, 0), id: 'k0' }, key(0.5, 50), { ...key(1, 100), id: 'k1' }]);
    expect(withId.map((k) => k.id)).toEqual(['k0', 'k2', 'k1']);
  });

  it('re-resolves derived leading keys against the merged document (no value pop, §2.6)', () => {
    setDevWarning(() => {});
    const derivedKeys = [key(0, 0), { ...key(1, 0), derived: true as const }, key(2, 300)];
    const codeTl = timeline({ tracks: [{ target: 'a/x', type: 'number', keys: derivedKeys }] });
    // an edit bumps the upstream key to 50 but carried the derived key's stale value (0)
    const edited = [key(0, 50), { ...key(1, 0), derived: true as const }, key(2, 300)];
    const sc = setSidecarTrack(emptySidecar(), 'main', 'a/x', 'number', edited, derivedKeys);
    const merged = mergeSidecar(codeTl, sc);
    const x = merged.tracks.find((t) => t.target === 'a/x')!;
    expect(x.keys.find((k) => k.derived)!.value).toBe(50); // re-resolved, not stale 0
  });

  it('rejects unknown sidecar versions', () => {
    expect(() => migrateSidecar({ sidecarVersion: 9 } as unknown as SidecarDoc)).toThrow(SidecarVersionError);
  });

  it('does not mutate inputs and survives JSON round trips', () => {
    const base = code();
    const sc = setSidecarTrack(emptySidecar(), 'main', 'a/x', 'number', [key(0, 7)], null);
    const merged = mergeSidecar(base, sc);
    expect(base.tracks[0]!.keys[0]!.value).toBe(0);
    expect(JSON.parse(JSON.stringify(merged))).toEqual(merged);
  });
});

describe('isEditableNodeId (§6.2 sub-decision — the node half of the editable gate)', () => {
  it('an explicit, stable id is editable', () => {
    expect(isEditableNodeId('title')).toBe(true);
    expect(isEditableNodeId('a')).toBe(true);
  });

  it('the structural fallback id (~Group.2/Rect.0) is never editable (§6.5)', () => {
    expect(isEditableNodeId('~Group.2/Rect.0')).toBe(false);
    expect(isEditableNodeId('~Rect.0')).toBe(false);
  });

  it('the root sentinel, empty, and absent ids are not editable', () => {
    expect(isEditableNodeId('__root')).toBe(false);
    expect(isEditableNodeId('')).toBe(false);
    expect(isEditableNodeId(undefined)).toBe(false);
    expect(isEditableNodeId(null)).toBe(false);
  });
});

describe('the three editable-track branches (§6.2 locked rule)', () => {
  // editable IFF the node has an explicit id (isEditableNodeId) AND a
  // merged/editor-created track exists (track.editable).
  const isEditable = (merged: ReturnType<typeof mergeSidecar>, target: string) => {
    const nodeId = target.slice(0, target.indexOf('/'));
    return isEditableNodeId(nodeId) && merged.tracks.find((t) => t.target === target)?.editable === true;
  };

  it('code-only track on an id\'d node ⇒ read-only (no editable flag, no sidecar)', () => {
    const merged = mergeSidecar(code(), null);
    expect(merged.tracks.find((t) => t.target === 'a/x')!.editable).toBeUndefined();
    expect(isEditable(merged, 'a/x')).toBe(false);
  });

  it('editable overlay on an id\'d node ⇒ editable', () => {
    const sc = setSidecarTrack(emptySidecar(), 'main', 'a/x', 'number', [key(0, 0), key(2, 9)], code().tracks[0]!.keys);
    expect(isEditable(mergeSidecar(code(), sc), 'a/x')).toBe(true);
  });

  it('un-id\'d (structural) node ⇒ never editable, even with an overlay flag', () => {
    const structural = timeline({ tracks: [{ target: '~Rect.0/x', type: 'number', keys: [key(0, 0)], editable: true }] });
    expect(isEditable(structural, '~Rect.0/x')).toBe(false);
  });
});

describe('deleteSidecarTrack (§6.2 rule 7 write-back)', () => {
  it('removes the entry without mutating the input', () => {
    const sc = setSidecarTrack(emptySidecar(), 'main', 'a/x', 'number', [key(0, 0)], null);
    const next = deleteSidecarTrack(sc, 'main', 'a/x');
    expect(next.timelines['main']!.tracks['a/x']).toBeUndefined();
    expect(sc.timelines['main']!.tracks['a/x']).toBeDefined(); // input untouched
  });

  it('after extraction the merge drops back to the code baseline', () => {
    const sc = setSidecarTrack(emptySidecar(), 'main', 'a/x', 'number', [key(0, 0), key(2, 500)], code().tracks[0]!.keys);
    expect(sampleTrack(compileTimeline(mergeSidecar(code(), sc)).tracks.get('a/x')!, 2)).toBe(500);
    const deleted = deleteSidecarTrack(sc, 'main', 'a/x');
    const back = mergeSidecar(code(), deleted);
    expect(back.tracks.find((t) => t.target === 'a/x')!.editable).toBeUndefined(); // code-owned again
    expect(sampleTrack(compileTimeline(back).tracks.get('a/x')!, 1)).toBe(100); // code values
  });

  it('a missing target / timeline is a no-op (returns the same doc)', () => {
    const sc = setSidecarTrack(emptySidecar(), 'main', 'a/x', 'number', [key(0, 0)], null);
    expect(deleteSidecarTrack(sc, 'main', 'a/nope')).toBe(sc);
    expect(deleteSidecarTrack(sc, 'other', 'a/x')).toBe(sc);
  });
});

describe('normalizeEditedKeys (§2.7 under editing)', () => {
  const cfg = { stiffness: 170, damping: 14, mass: 1 };

  it('re-pins a dragged spring key to prev.t + spring.duration', async () => {
    const { spring, normalizeEditedKeys } = await import('../src/index.js');
    const d = spring.duration(cfg);
    const keys = [key(0, 0), key(0.78, 300, spring(cfg))]; // dragged off-grid
    const fixed = normalizeEditedKeys(keys);
    expect(fixed[1]!.t).toBeCloseTo(d, 9);
  });

  it('retiming the predecessor carries the spring key along', async () => {
    const { spring, normalizeEditedKeys } = await import('../src/index.js');
    const d = spring.duration(cfg);
    const keys = [key(0.5, 0), key(d, 300, spring(cfg))]; // prev moved to 0.5
    const fixed = normalizeEditedKeys(keys);
    expect(fixed[1]!.t).toBeCloseTo(0.5 + d, 9);
  });

  it('sorts retimed keys and the result passes document validation', async () => {
    const { spring, normalizeEditedKeys, compileTimeline, timeline } = await import('../src/index.js');
    const keys = normalizeEditedKeys([key(2, 1), key(0.3, 0), key(2.5, 5, spring(cfg))]);
    expect(keys.map((k) => k.t)).toEqual([...keys.map((k) => k.t)].sort((a, b) => a - b));
    const doc = timeline({ tracks: [{ target: 'a/x', type: 'number', keys }] });
    expect(() => compileTimeline(doc)).not.toThrow();
  });
});

describe('normalizeEditedKeys: collisions nudge, never delete', () => {
  it('a key dragged onto another keeps both (1ms nudge)', async () => {
    const { normalizeEditedKeys } = await import('../src/index.js');
    const fixed = normalizeEditedKeys([key(1.5, -1), key(1.5, 1, { interp: 'hold' })]);
    expect(fixed).toHaveLength(2);
    expect(fixed[1]!.t).toBeCloseTo(1.501, 9);
    expect(fixed.map((k) => k.value)).toEqual([-1, 1]);
  });
});

describe("setSidecarTrack editable-host guard (§finding-3)", () => {
  it("rejects a structural '~' or empty-nodeId target; accepts an explicit id", () => {
    expect(() => setSidecarTrack(emptySidecar(), 'main', '~Group.0/x', 'number', [key(0, 0)], null)).toThrow(/structural/);
    expect(() => setSidecarTrack(emptySidecar(), 'main', '/x', 'number', [key(0, 0)], null)).toThrow();
    expect(() => setSidecarTrack(emptySidecar(), 'main', 'box/x', 'number', [key(0, 0)], null)).not.toThrow();
  });
});

/**
 * gs diff substrate (§3.3): the index-aligned positional DisplayList diff,
 * `.dl.json` snapshot round-trip, and — CRITICALLY — the pinned-cacheKey
 * regression guard that proves extracting the shared collapse-replacer did NOT
 * move the §3.5 raster cacheKey bytes.
 */

import { describe, expect, it } from 'vitest';
import { createDisplayListBuilder, type DisplayList, type DrawCommand, type Resource } from '../src/index.js';
// Diff/snapshot diagnostics moved to the `@glissade/scene/diagnostics` subpath
// (0.20 budget review); `collapseReplacer` stays render-path (re-exported by both).
import {
  diffDisplayLists,
  formatDisplayDiff,
  serializeDisplayList,
  parseDisplaySnapshot,
  collapseReplacer,
  DL_SNAPSHOT_VERSION,
  DlSnapshotError,
} from '../src/diagnostics.js';

function dl(commands: DrawCommand[], resources: Resource[] = [], size = { w: 100, h: 50 }): DisplayList {
  return { commands, resources, size };
}

describe('collapseReplacer (the shared byte-preserving serializer)', () => {
  it('collapses ArrayBuffer / views to a length marker and drops functions', () => {
    expect(collapseReplacer('k', new ArrayBuffer(8))).toBe('ab:8');
    expect(collapseReplacer('k', new Uint8Array(4))).toBe('view:4');
    expect(collapseReplacer('k', () => 0)).toBeUndefined();
    expect(collapseReplacer('k', 12.5)).toBe(12.5);
  });

  it('does NOT normalize -0 (byte preservation: matrix.ts normalizes at the source)', () => {
    // The replacer must pass -0 through unchanged; rewriting it would move the
    // cacheKey bytes for any list that ever carried a raw -0.
    expect(collapseReplacer('k', -0)).toBe(-0);
    expect(Object.is(collapseReplacer('k', -0), -0)).toBe(true);
  });

  it('maps NaN / Infinity / -Infinity to DISTINCT sentinels (JSON would collide them all to null)', () => {
    // JSON.stringify natively serializes all three non-finite numbers to `null`,
    // colliding the cacheKey of lists that differ only in WHICH one reaches a
    // draw field. The replacer keeps them apart.
    expect(collapseReplacer('k', NaN)).toBe('NaN');
    expect(collapseReplacer('k', Infinity)).toBe('Infinity');
    expect(collapseReplacer('k', -Infinity)).toBe('-Infinity');
    const tokens = new Set([
      JSON.stringify(NaN, collapseReplacer),
      JSON.stringify(Infinity, collapseReplacer),
      JSON.stringify(-Infinity, collapseReplacer),
    ]);
    expect(tokens.size).toBe(3); // all three serialize differently now
  });

  it('PLANTED REGRESSION: two DisplayLists differing only NaN vs Infinity at a draw field diff (no cacheKey collision)', () => {
    // Before the fix both fields serialized to `null` → diffDisplayLists reported
    // them EQUAL (a stale-raster false-OK). They must now be distinguished.
    const a = dl([{ op: 'fillText', text: 'hi', font: { family: 'X', size: 12 }, paint: { kind: 'color', color: '#000' }, x: NaN, y: 2 }]);
    const b = dl([{ op: 'fillText', text: 'hi', font: { family: 'X', size: 12 }, paint: { kind: 'color', color: '#000' }, x: Infinity, y: 2 }]);
    const d = diffDisplayLists(a, b);
    expect(d.equal).toBe(false);
    expect(d.deltas).toHaveLength(1);
    expect(d.deltas[0]!.fields).toEqual([{ path: 'x', from: NaN, to: Infinity }]);
  });

  it('leaves FINITE-number serialization byte-identical (the non-finite branch never touches them)', () => {
    // The shared replacer backs the §3.5 cacheKey; a finite value must serialize
    // exactly as before. Spot-check the value forms the cacheKey actually carries.
    for (const v of [0, -0, 1, -1, 12.5, 1e-9, 1e21, Number.MAX_SAFE_INTEGER]) {
      expect(JSON.stringify(v, collapseReplacer)).toBe(JSON.stringify(v));
    }
  });
});

describe('PINNED cacheKey regression guard (BLOCKING — extraction must not move bytes)', () => {
  // The exact key a fixed 8-command slice hashed to BEFORE the collapse-replacer
  // was extracted out of createDisplayListBuilder.cacheKey. If this literal ever
  // changes, the §3.5 raster cache is silently invalidated cluster-wide.
  // Verified IDENTICAL by re-deriving the original inline replacer's output for
  // this exact input (pre-extraction) — the extraction did not move bytes.
  const PINNED = '9700fe59';

  it('a fixed DisplayList slice still hashes to the pinned cacheKey', () => {
    const b = createDisplayListBuilder({ w: 100, h: 50 });
    const p1 = b.resource({ kind: 'path', segs: [['M', 0, 0], ['L', 10, -0], ['C', 1, 2, 3, 4, 5, 6], ['Z']] });
    const img = b.resource({ kind: 'image', assetId: 'logo' });
    b.push({ op: 'save' });
    b.push({ op: 'transform', m: [1, 0, 0, 1, 12.5, -0] });
    b.push({ op: 'fillPath', path: p1, paint: { kind: 'color', color: '#ff0000' } });
    b.push({ op: 'drawImage', image: img, dst: { x: 0, y: 0, w: 10, h: 10 } });
    b.push({ op: 'pushGroup', opacity: 0.5, blend: 'multiply', filters: [{ kind: 'blur', radius: 3 }] });
    b.push({ op: 'fillText', text: 'hi', font: { family: 'X', size: 12 }, paint: { kind: 'color', color: '#000' }, x: 1, y: 2 });
    b.push({ op: 'popGroup' });
    b.push({ op: 'restore' });
    expect(b.cacheKey?.(0, 8)).toBe(PINNED);
  });
});

describe('diffDisplayLists — index-aligned positional', () => {
  it('reports two identical lists as equal with no deltas', () => {
    const a = dl([{ op: 'save' }, { op: 'restore' }]);
    const b = dl([{ op: 'save' }, { op: 'restore' }]);
    const d = diffDisplayLists(a, b);
    expect(d.equal).toBe(true);
    expect(d.deltas).toEqual([]);
  });

  it('names the changed field on a same-op divergence (fill[from,to])', () => {
    const a = dl([{ op: 'fillText', text: 'hi', font: { family: 'X', size: 12 }, paint: { kind: 'color', color: '#000' }, x: 1, y: 2 }]);
    const b = dl([{ op: 'fillText', text: 'hi', font: { family: 'X', size: 12 }, paint: { kind: 'color', color: '#fff' }, x: 1, y: 2 }]);
    const d = diffDisplayLists(a, b);
    expect(d.equal).toBe(false);
    expect(d.deltas).toHaveLength(1);
    const delta = d.deltas[0]!;
    expect(delta).toMatchObject({ index: 0, kind: 'change', opA: 'fillText', opB: 'fillText' });
    expect(delta.fields).toEqual([{ path: 'paint', from: { kind: 'color', color: '#000' }, to: { kind: 'color', color: '#fff' } }]);
  });

  it('reports an op change as a single op field', () => {
    const a = dl([{ op: 'save' }]);
    const b = dl([{ op: 'restore' }]);
    const d = diffDisplayLists(a, b);
    expect(d.deltas[0]).toMatchObject({ index: 0, kind: 'change', opA: 'save', opB: 'restore' });
    expect(d.deltas[0]!.fields).toEqual([{ path: 'op', from: 'save', to: 'restore' }]);
  });

  it('marks trailing commands as add / remove', () => {
    const a = dl([{ op: 'save' }]);
    const b = dl([{ op: 'save' }, { op: 'restore' }]);
    expect(diffDisplayLists(a, b).deltas).toEqual([{ index: 1, kind: 'add', opB: 'restore', fields: [] }]);
    expect(diffDisplayLists(b, a).deltas).toEqual([{ index: 1, kind: 'remove', opA: 'restore', fields: [] }]);
  });

  it('documents the v1 insert-cascade cliff: a leading insert reports a run of changes', () => {
    const a = dl([{ op: 'save' }, { op: 'restore' }]);
    const b = dl([{ op: 'transform', m: [1, 0, 0, 1, 0, 0] }, { op: 'save' }, { op: 'restore' }]);
    const d = diffDisplayLists(a, b);
    // positional alignment: index 0 differs (save vs transform), 1 differs
    // (restore vs save), 2 is an add — the cascade the LOCKED decision accepts.
    expect(d.deltas.map((x) => x.kind)).toEqual(['change', 'change', 'add']);
  });

  it('inlines referenced resources by CONTENT (path geometry, not interned id)', () => {
    // Same geometry, different interned ids → NOT a diff.
    const a = dl([{ op: 'fillPath', path: 1, paint: { kind: 'color', color: '#000' } }], [
      { kind: 'path', segs: [['M', 9, 9]] },
      { kind: 'path', segs: [['M', 0, 0], ['L', 1, 1]] },
    ]);
    const b = dl([{ op: 'fillPath', path: 0, paint: { kind: 'color', color: '#000' } }], [
      { kind: 'path', segs: [['M', 0, 0], ['L', 1, 1]] },
    ]);
    expect(diffDisplayLists(a, b).equal).toBe(true);

    // Different geometry under the same id IS a diff.
    const c = dl([{ op: 'fillPath', path: 0, paint: { kind: 'color', color: '#000' } }], [
      { kind: 'path', segs: [['M', 0, 0], ['L', 2, 2]] },
    ]);
    expect(diffDisplayLists(b, c).equal).toBe(false);
  });

  it('detects a canvas size divergence', () => {
    const a = dl([], [], { w: 100, h: 50 });
    const b = dl([], [], { w: 200, h: 50 });
    const d = diffDisplayLists(a, b);
    expect(d.equal).toBe(false);
    expect(d.size).toEqual({ from: { w: 100, h: 50 }, to: { w: 200, h: 50 } });
  });

  it('formatDisplayDiff renders a readable command tree', () => {
    const a = dl([{ op: 'save' }]);
    const b = dl([{ op: 'restore' }]);
    const text = formatDisplayDiff(diffDisplayLists(a, b));
    expect(text).toContain('[0]');
    expect(text).toContain('save');
    expect(text).toContain('restore');
    expect(formatDisplayDiff(diffDisplayLists(a, a))).toBe('DisplayLists are identical.');
  });
});

describe('.dl.json snapshot (§7.4 third interchange schema)', () => {
  const sample = dl(
    [
      { op: 'save' },
      { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#abc' } },
      { op: 'restore' },
    ],
    [{ kind: 'path', segs: [['M', 0, 0], ['L', 5, 5], ['Z']] }],
  );

  it('round-trips through serialize → parse', () => {
    const json = serializeDisplayList(sample);
    const parsed = parseDisplaySnapshot(json);
    expect(parsed).toEqual(sample);
  });

  it('stamps the versioned interchange field dlSnapshotVersion', () => {
    const doc = JSON.parse(serializeDisplayList(sample)) as { dlSnapshotVersion: number };
    expect(doc.dlSnapshotVersion).toBe(DL_SNAPSHOT_VERSION);
  });

  it('rejects an unknown snapshot version (break-policy obligation)', () => {
    const bad = JSON.stringify({ dlSnapshotVersion: 999, size: { w: 1, h: 1 }, commands: [], resources: [] });
    expect(() => parseDisplaySnapshot(bad)).toThrow(DlSnapshotError);
  });

  it('rejects a malformed snapshot', () => {
    const bad = JSON.stringify({ dlSnapshotVersion: DL_SNAPSHOT_VERSION, commands: [] });
    expect(() => parseDisplaySnapshot(bad)).toThrow(DlSnapshotError);
  });
});

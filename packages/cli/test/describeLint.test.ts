/**
 * `gs describe --lint` (0.47) — the describe()↔bundle drift guard, unit-tested
 * against seeded-drift fixtures + the REAL manifest/surface. Each historical drift
 * class (a missing helper, a type surfaced as a value, an arity mismatch) has a
 * fixture that must produce exactly its violation; the clean manifest produces none.
 */

import { describe as vdescribe, expect, it } from 'vitest';
import type { ApiManifest, DescribedHelper, SurfaceEntry } from '@glissade/scene/describe';
import { describe as realDescribe } from '@glissade/scene/describe';
import { collectRuntimeSurface, describeLint, exemptFromUnreachable } from '../src/describeLint.js';

/** Build a minimal manifest with the sections the lint reads. */
function manifest(over: Partial<ApiManifest> = {}): ApiManifest {
  return {
    version: '0.47.0',
    nodes: {}, // narrow fixtures add only what each drift class needs (a Rect node leaks into every surface otherwise)
    valueTypes: ['number', 'vec2'],
    easings: ['linear'],
    builder: { methods: [] },
    helpers: [],
    createScene: '',
    subpaths: {},
    surface: [],
    ...over,
  };
}

const helper = (over: Partial<DescribedHelper> & { name: string }): DescribedHelper => ({
  summary: 's',
  import: '@glissade/scene',
  usage: `${over.name}(a)`,
  ...over,
});

const val = (name: string, form: SurfaceEntry['form'] = 'function', arity?: number): SurfaceEntry =>
  ({ name, kind: 'value', iife: true, form, ...(arity !== undefined ? { arity } : {}) });

vdescribe('describeLint — clean', () => {
  it('a manifest whose every member resolves → 0 violations', () => {
    const m = manifest({
      helpers: [helper({ name: 'motionPath', usage: 'motionPath(path)' })],
      surface: [val('Rect', 'constructor'), val('motionPath', 'function', 1), val('timeline', 'function', 1), { name: 'easings', kind: 'value', iife: true, form: 'object' }, { name: 'Paint', kind: 'type', iife: false, form: 'type' }],
    });
    const surface = { Rect: class {}, motionPath: (_p: unknown) => {}, timeline: (_b: unknown) => {}, easings: {} };
    expect(describeLint(m, surface)).toEqual([]);
  });
});

vdescribe('describeLint — seeded drift', () => {
  it('a described helper MISSING from the bundle → a `missing` violation', () => {
    const m = manifest({ helpers: [helper({ name: 'fitTextSize' })], surface: [val('fitTextSize')] });
    const v = describeLint(m, { Rect: class {} }); // fitTextSize absent
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: 'missing', name: 'fitTextSize' });
  });

  it('a described callable that resolves to a NON-function → a `not-callable` violation', () => {
    const m = manifest({ helpers: [helper({ name: 'clip' })], surface: [val('clip')] });
    const v = describeLint(m, { clip: { not: 'a function' } });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: 'not-callable', name: 'clip' });
  });

  it('a `kind:type` name that resolves to a runtime VALUE → a `type-as-value` violation (ClipRegion-class drift)', () => {
    const m = manifest({ surface: [{ name: 'ClipRegion', kind: 'type', iife: false, form: 'type' }] });
    const v = describeLint(m, { ClipRegion: (_x: unknown) => {} }); // wrongly a runtime value
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: 'type-as-value', name: 'ClipRegion' });
  });

  it('a helper whose runtime arity FAR exceeds its documented usage → an `arity` violation', () => {
    const m = manifest({ helpers: [helper({ name: 'splitText', usage: 'splitText(text)' })], surface: [val('splitText', 'function', 1)] });
    // runtime fn takes 3 params, usage documents 1 → 3 > 1 + 1 → violation
    const v = describeLint(m, { splitText: (_a: unknown, _b: unknown, _c: unknown) => {} });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: 'arity', name: 'splitText' });
  });

  it('tolerates a one-param arity delta (a trailing optional like `measurer`) → no violation', () => {
    const m = manifest({ helpers: [helper({ name: 'measureWrappedText', usage: 'measureWrappedText(text, font, width, lineHeight)' })] });
    // runtime has 5 params (…, measurer), usage documents 4 → 5 <= 4 + 1 → clean
    const surface = { measureWrappedText: (_a: unknown, _b: unknown, _c: unknown, _d: unknown, _e: unknown) => {} };
    expect(describeLint(m, surface)).toEqual([]);
  });

  it('EXEMPTS a name the runtime could not load (browser-only helper) — reported skipped, not a violation', () => {
    const m = manifest({ helpers: [helper({ name: 'renderToDataURL', import: '@glissade/backend-canvas2d/snapshot' })], surface: [val('renderToDataURL')] });
    const exempt = new Set(['renderToDataURL']);
    expect(describeLint(m, {}, { exempt })).toEqual([]); // absent, but exempt
    // …and WITHOUT the exemption it IS a violation
    expect(describeLint(m, {})).toHaveLength(1);
  });
});

vdescribe('describeLint — against the real manifest + assembled surface', () => {
  it('the live describe() manifest is clean against the headlessly-reachable surface', async () => {
    const m = realDescribe();
    const { surface, unreachable } = await collectRuntimeSurface(m);
    const exempt = exemptFromUnreachable(m, unreachable);
    // Sanity: the two browser-only snapshot helpers are the only ones exempted.
    for (const n of exempt) expect(['renderToDataURL', 'snapshotCanvas']).toContain(n);
    expect(describeLint(m, surface, { exempt })).toEqual([]);
  });
});

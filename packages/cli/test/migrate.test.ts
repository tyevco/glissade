/**
 * gs migrate (0.31): the manifest-diff engine. Proves the migration report is
 * generated FROM the two describe() manifests — every real move/removal/addition/
 * change is surfaced with the right breaking classification, and an unchanged
 * manifest yields an empty report (the no-drift guarantee: it can't invent a move).
 */

import { describe as vdescribe, expect, it } from 'vitest';
import type { ApiManifest } from '@glissade/scene/describe';
import { diffManifests, formatReport, type MigrationChange } from '../src/migrate.js';

/** A minimal-but-valid manifest; override any slice per test. */
function manifest(over: Partial<ApiManifest> = {}): ApiManifest {
  return {
    version: '0.20.0',
    nodes: {
      Circle: { props: { radius: { type: 'number', animatable: true, target: '<id>/radius' } }, positionAnchor: 'center' },
    },
    valueTypes: ['number', 'vec2', 'color'],
    easings: ['linear', 'easeInOutCubic'],
    builder: { methods: [{ name: 'to', signature: 'to(sel, props, opts?)' }] },
    helpers: [{ name: 'followPath', summary: 'drive position along a path', import: '@glissade/scene/motion', usage: 'followPath(path)' }],
    createScene: 'createScene(opts)',
    subpaths: { '.': '@glissade/scene', './motion': 'motion helpers' },
    ...over,
  };
}

/** Find one change by (category, name) — the assertion workhorse. */
function find(changes: readonly MigrationChange[], category: string, name: string): MigrationChange | undefined {
  return changes.find((c) => c.category === category && c.name === name);
}

vdescribe('diffManifests', () => {
  it('identical manifests → empty report (no-drift: cannot invent a move)', () => {
    const r = diffManifests(manifest(), manifest());
    expect(r.changes).toHaveLength(0);
    expect(r.summary).toEqual({ breaking: 0, additive: 0, total: 0 });
    expect(r.from).toBe('0.20.0');
  });

  it('carries from/to versions from the manifests', () => {
    const r = diffManifests(manifest({ version: '0.13.0' }), manifest({ version: '0.31.0' }));
    expect(r.from).toBe('0.13.0');
    expect(r.to).toBe('0.31.0');
  });

  it('flags a helper import MOVE (the tokenHighlight/motionPath case) as breaking with the new import as the fix', () => {
    const to = manifest({
      helpers: [{ name: 'followPath', summary: 'drive position along a path', import: '@glissade/scene/motion2', usage: 'followPath(path)' }],
    });
    const c = find(diffManifests(manifest(), to).changes, 'helper', 'followPath');
    expect(c).toMatchObject({ kind: 'moved', breaking: true });
    expect(c?.action).toBe("import { followPath } from '@glissade/scene/motion2'");
  });

  it('flags a removed helper as breaking, an added helper as additive', () => {
    const to = manifest({
      helpers: [{ name: 'lookAt', summary: 'face a target', import: '@glissade/scene/motion', usage: 'lookAt(target)' }],
    });
    const changes = diffManifests(manifest(), to).changes;
    expect(find(changes, 'helper', 'followPath')).toMatchObject({ kind: 'removed', breaking: true });
    expect(find(changes, 'helper', 'lookAt')).toMatchObject({ kind: 'added', breaking: false });
  });

  it('flags a helper signature change as breaking', () => {
    const to = manifest({
      helpers: [{ name: 'followPath', summary: 'drive position along a path', import: '@glissade/scene/motion', usage: 'followPath(path, { align })' }],
    });
    expect(find(diffManifests(manifest(), to).changes, 'helper', 'followPath')).toMatchObject({ kind: 'changed', breaking: true });
  });

  it('flags a node import MOVE via subpath change', () => {
    const from = manifest({ nodes: { Grid: { props: {}, positionAnchor: 'center' } } });
    const to = manifest({ nodes: { Grid: { props: {}, positionAnchor: 'center', subpath: '@glissade/scene/layout' } } });
    const c = find(diffManifests(from, to).changes, 'node', 'Grid');
    expect(c).toMatchObject({ kind: 'moved', breaking: true });
    expect(c?.action).toBe("import { Grid } from '@glissade/scene/layout'");
  });

  it('flags a removed node and an added node', () => {
    const from = manifest({ nodes: { Old: { props: {}, positionAnchor: 'center' } } });
    const to = manifest({ nodes: { New: { props: {}, positionAnchor: 'center' } } });
    const changes = diffManifests(from, to).changes;
    expect(find(changes, 'node', 'Old')).toMatchObject({ kind: 'removed', breaking: true });
    expect(find(changes, 'node', 'New')).toMatchObject({ kind: 'added', breaking: false });
  });

  it('diffs a node\'s props: removed=breaking, added=additive, type-change=breaking', () => {
    const from = manifest({
      nodes: { Box: { props: { w: { type: 'number', animatable: true, target: '<id>/w' }, gone: { type: 'color', animatable: false } }, positionAnchor: 'center' } },
    });
    const to = manifest({
      nodes: { Box: { props: { w: { type: 'vec2', animatable: true, target: '<id>/w' }, added: { type: 'number', animatable: false } }, positionAnchor: 'center' } },
    });
    const changes = diffManifests(from, to).changes;
    expect(find(changes, 'prop', 'Box.gone')).toMatchObject({ kind: 'removed', breaking: true });
    expect(find(changes, 'prop', 'Box.added')).toMatchObject({ kind: 'added', breaking: false });
    expect(find(changes, 'prop', 'Box.w')).toMatchObject({ kind: 'changed', breaking: true, detail: 'value type number → vec2' });
  });

  it('classifies animatable transitions: true→false breaking, false→true additive', () => {
    const from = manifest({
      nodes: { N: { props: { a: { type: 'number', animatable: true, target: '<id>/a' }, b: { type: 'number', animatable: false } }, positionAnchor: 'center' } },
    });
    const to = manifest({
      nodes: { N: { props: { a: { type: 'number', animatable: false }, b: { type: 'number', animatable: true, target: '<id>/b' } }, positionAnchor: 'center' } },
    });
    const changes = diffManifests(from, to).changes;
    expect(find(changes, 'prop', 'N.a')).toMatchObject({ breaking: true });
    expect(find(changes, 'prop', 'N.b')).toMatchObject({ breaking: false });
  });

  it('diffs builder methods, value types, and easings', () => {
    const from = manifest({
      builder: { methods: [{ name: 'to', signature: 'to(sel, props)' }, { name: 'gone', signature: 'gone()' }] },
      valueTypes: ['number', 'oldType'],
      easings: ['linear', 'oldEase'],
    });
    const to = manifest({
      builder: { methods: [{ name: 'to', signature: 'to(sel, props, opts)' }, { name: 'fresh', signature: 'fresh()' }] },
      valueTypes: ['number', 'newType'],
      easings: ['linear', 'newEase'],
    });
    const changes = diffManifests(from, to).changes;
    expect(find(changes, 'builder', 'tl.to')).toMatchObject({ kind: 'changed', breaking: true });
    expect(find(changes, 'builder', 'tl.gone')).toMatchObject({ kind: 'removed', breaking: true });
    expect(find(changes, 'builder', 'tl.fresh')).toMatchObject({ kind: 'added', breaking: false });
    expect(find(changes, 'valueType', 'oldType')).toMatchObject({ kind: 'removed', breaking: true });
    expect(find(changes, 'valueType', 'newType')).toMatchObject({ kind: 'added', breaking: false });
    expect(find(changes, 'easing', 'oldEase')).toMatchObject({ kind: 'removed', breaking: true });
  });

  it('does not throw on a baseline PREDATING a describe() field (the deep-jump case)', () => {
    // A real 0.19.1-shaped manifest: helpers/builder/valueTypes/easings/subpaths
    // were all added to describe() AFTER it, so an old-but-valid manifest has only
    // version + nodes. This is EXACTLY the long-lived-jump case migrate exists for —
    // it must diff, not crash (regression for the from.helpers.map TypeError).
    const legacy = { version: '0.19.1', nodes: { Circle: { props: {}, positionAnchor: 'center' } } } as unknown as ApiManifest;
    const current = manifest({ version: '0.31.0' });
    expect(() => diffManifests(legacy, current)).not.toThrow();
    const r = diffManifests(legacy, current);
    expect(r.from).toBe('0.19.1');
    expect(r.to).toBe('0.31.0');
    // the current engine's helpers/valueTypes/easings/builder all surface as ADDITIVE
    // (the baseline never recorded them), none breaking, and nothing crashes.
    expect(find(r.changes, 'helper', 'followPath')).toMatchObject({ kind: 'added', breaking: false });
    expect(find(r.changes, 'valueType', 'vec2')).toMatchObject({ kind: 'added', breaking: false });
    expect(find(r.changes, 'builder', 'tl.to')).toMatchObject({ kind: 'added', breaking: false });
    expect(r.summary.breaking).toBe(0);
  });

  it('is symmetric-safe: a current engine MISSING a field the baseline had does not throw', () => {
    const from = manifest();
    const stripped = { version: '0.40.0', nodes: from.nodes } as unknown as ApiManifest;
    expect(() => diffManifests(from, stripped)).not.toThrow();
    // the baseline's helpers/valueTypes now read as REMOVED (breaking) — no crash
    expect(find(diffManifests(from, stripped).changes, 'helper', 'followPath')).toMatchObject({ kind: 'removed', breaking: true });
  });

  it('summary counts and ordering are deterministic', () => {
    const to = manifest({
      helpers: [{ name: 'brandNew', summary: 'x', import: '@glissade/scene', usage: 'brandNew()' }],
      valueTypes: ['number', 'vec2', 'color', 'spectrum'],
    });
    const r1 = diffManifests(manifest(), to);
    const r2 = diffManifests(manifest(), to);
    expect(r1).toEqual(r2); // pure
    expect(r1.summary.total).toBe(r1.summary.breaking + r1.summary.additive);
    // removed followPath (breaking) + added brandNew (additive) + added spectrum (additive)
    expect(r1.summary.breaking).toBe(1);
    expect(r1.summary.additive).toBe(2);
  });
});

vdescribe('formatReport', () => {
  it('reports a clean bill when nothing changed', () => {
    const text = formatReport(diffManifests(manifest(), manifest()));
    expect(text).toContain('no API changes');
    expect(text).toContain('0.20.0 → 0.20.0');
  });

  it('groups breaking above additive and prints the suggested action', () => {
    const to = manifest({
      helpers: [{ name: 'followPath', summary: 'x', import: '@glissade/scene/motion2', usage: 'followPath(path)' }],
      valueTypes: ['number', 'vec2', 'color', 'spectrum'],
    });
    const text = formatReport(diffManifests(manifest(), to));
    expect(text).toContain('BREAKING');
    expect(text).toContain('ADDITIVE');
    expect(text.indexOf('BREAKING')).toBeLessThan(text.indexOf('ADDITIVE'));
    expect(text).toContain("import { followPath } from '@glissade/scene/motion2'");
    expect(text).toContain('1 breaking · 1 additive');
  });
});

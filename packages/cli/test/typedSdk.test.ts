/**
 * gs types (0.44) — the typed-SDK generator. Codegen a `track()` surface from the
 * describe() ApiManifest so a typo'd prop-path or a wrong value-type id is a COMPILE
 * error. Pure manifest→source; the generated file's real type-checking is proven by
 * the compile-smoke (tsc over a generated file + good/bad usages).
 */

import { describe, expect, it } from 'vitest';
import type { ApiManifest } from '@glissade/scene/describe';
import { collectTargets, generateTypedSdk } from '../src/typedSdk.js';

const manifest = (nodes: ApiManifest['nodes']): ApiManifest => ({
  version: '0.44.0', valueTypes: ['number', 'vec2', 'color'], easings: [], builder: { methods: [] },
  helpers: [], createScene: '', subpaths: {}, nodes,
});

const base = manifest({
  Circle: {
    positionAnchor: 'center',
    props: {
      opacity: { type: 'number', animatable: true, target: '<id>/opacity' },
      'position.x': { type: 'number', animatable: true, target: '<id>/position.x' },
      fill: { type: 'color', animatable: true, target: '<id>/fill' },
      assetId: { type: 'string', animatable: false, required: true }, // construction-only → excluded
    },
  },
  Rect: {
    positionAnchor: 'center',
    props: {
      position: { type: 'vec2', animatable: true, target: '<id>/position' },
      opacity: { type: 'number', animatable: true, target: '<id>/opacity' }, // dup path, same type → deduped
    },
  },
});

describe('collectTargets', () => {
  it('collects animatable paths (sorted, deduped), excludes construction props', () => {
    const { targets, conflicts } = collectTargets(base);
    expect(targets.map((t) => t.path)).toEqual(['fill', 'opacity', 'position', 'position.x']);
    expect(targets.find((t) => t.path === 'opacity')!.valueType).toBe('number');
    expect(targets.find((t) => t.path === 'position')!.valueType).toBe('vec2');
    expect(targets.some((t) => t.path === 'assetId')).toBe(false); // construction-only, no target
    expect(conflicts).toEqual([]);
  });
  it('reports a path carrying >1 value type across nodes (a taxonomy smell, not silent)', () => {
    const { conflicts } = collectTargets(manifest({
      A: { positionAnchor: 'center', props: { x: { type: 'number', animatable: true, target: '<id>/x' } } },
      B: { positionAnchor: 'center', props: { x: { type: 'vec2', animatable: true, target: '<id>/x' } } },
    }));
    expect(conflicts.some((c) => c.includes('x') && c.includes('number') && c.includes('vec2'))).toBe(true);
  });
});

describe('generateTypedSdk', () => {
  const src = generateTypedSdk(base);
  it('emits the KnownTrackPath union of animatable paths (not construction props)', () => {
    expect(src).toMatch(/export type KnownTrackPath =/);
    expect(src).toContain("| 'opacity'");
    expect(src).toContain("| 'position.x'");
    expect(src).toContain("| 'fill'");
    expect(src).not.toContain("| 'assetId'"); // construction excluded
  });
  it('emits the TrackTarget template + per-path TypeIdOf / ValueOf maps', () => {
    expect(src).toContain('export type TrackTarget = `${string}/${KnownTrackPath}`;');
    expect(src).toContain("P extends `${string}/opacity` ? 'number' :"); // TypeIdOf
    expect(src).toContain('P extends `${string}/position` ? readonly [number, number] :'); // ValueOf: vec2 → tuple
    expect(src).toContain("P extends `${string}/fill` ? 'color' :");
  });
  it('re-exports a type-narrowed `track` whose runtime is core\'s track', () => {
    expect(src).toContain("import { track as _track, type Track, type Key } from '@glissade/core';");
    expect(src).toContain('export const track = _track as <P extends TrackTarget>(');
    expect(src).toContain('type: TypeIdOf<P>,');
    expect(src).toContain('keys: Key<ValueOf<P>>[],');
  });
  it('imports the core value types it references (paint/fontAxes/path) only when used', () => {
    expect(generateTypedSdk(manifest({
      P: { positionAnchor: 'center', props: { fill: { type: 'paint', animatable: true, target: '<id>/fill' } } },
    }))).toContain("import type { Paint } from '@glissade/core';");
    expect(src).not.toMatch(/import type \{[^}]*Paint/); // base has no paint target → no import
  });
  it('is deterministic — same manifest → byte-identical output', () => {
    expect(generateTypedSdk(base)).toBe(src);
  });
});

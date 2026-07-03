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
  version: '0.44.0', valueTypes: ['number', 'vec2', 'color', 'paint'], easings: [], builder: { methods: [] },
  helpers: [], createScene: '', subpaths: {}, nodes,
});

const base = manifest({
  Circle: {
    positionAnchor: 'center',
    props: {
      opacity: { type: 'number', animatable: true, target: '<id>/opacity' },
      'position.x': { type: 'number', animatable: true, target: '<id>/position.x' },
      fill: { type: 'color|paint', animatable: true, target: '<id>/fill' }, // POLYMORPHIC (the 0.44.1 bug)
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
    const { targets } = collectTargets(base);
    expect(targets.map((t) => t.path)).toEqual(['fill', 'opacity', 'position', 'position.x']);
    expect(targets.find((t) => t.path === 'opacity')!.valueTypes).toEqual(['number']);
    expect(targets.find((t) => t.path === 'position')!.valueTypes).toEqual(['vec2']);
    expect(targets.some((t) => t.path === 'assetId')).toBe(false); // construction-only, no target
  });
  it('UNIONS a polymorphic value type (fill: color|paint) into its members', () => {
    const { targets, polymorphic } = collectTargets(base);
    expect(targets.find((t) => t.path === 'fill')!.valueTypes).toEqual(['color', 'paint']); // split on `|`, sorted
    expect(polymorphic).toEqual(['fill: color | paint']);
  });
  it('unions a path that carries different types across NODES (not just within one prop)', () => {
    const { targets } = collectTargets(manifest({
      A: { positionAnchor: 'center', props: { x: { type: 'number', animatable: true, target: '<id>/x' } } },
      B: { positionAnchor: 'center', props: { x: { type: 'color', animatable: true, target: '<id>/x' } } },
    }));
    expect(targets.find((t) => t.path === 'x')!.valueTypes).toEqual(['color', 'number']);
  });
});

describe('generateTypedSdk', () => {
  const src = generateTypedSdk(base);
  it('emits the KnownTrackPath union of animatable paths (not construction props)', () => {
    expect(src).toMatch(/export type KnownTrackPath =/);
    expect(src).toContain("| 'opacity'");
    expect(src).toContain("| 'fill'");
    expect(src).not.toContain("| 'assetId'");
  });
  it('emits a value-type UNION for a polymorphic path (the fill false-positive fix)', () => {
    // TypeIdOf<…/fill> must accept EITHER member, not the joined literal 'color|paint'
    expect(src).toContain("P extends `${string}/fill` ? 'color' | 'paint' :");
    expect(src).not.toContain("'color|paint'"); // never the broken joined literal
    // ValueOf<…/fill> = the value union (color→string, paint→Paint)
    expect(src).toContain('P extends `${string}/fill` ? string | Paint :');
    // single-type paths stay single
    expect(src).toContain("P extends `${string}/opacity` ? 'number' :");
    expect(src).toContain('P extends `${string}/position` ? readonly [number, number] :');
  });
  it('imports the core value types the unions reference (Paint for color|paint)', () => {
    expect(src).toContain("import type { Paint } from '@glissade/core';");
  });
  it('re-exports a type-narrowed `track` whose runtime is core\'s track', () => {
    expect(src).toContain("import { track as _track, type Track, type Key } from '@glissade/core';");
    expect(src).toContain('export const track = _track as <P extends TrackTarget>(');
    expect(src).toContain('type: TypeIdOf<P>,');
    expect(src).toContain('keys: Key<ValueOf<P>>[],');
  });
  it('notes polymorphic paths in the header', () => {
    expect(src).toContain('Polymorphic paths (accept a value-type UNION): fill: color | paint');
  });
  it('is deterministic — same manifest → byte-identical output', () => {
    expect(generateTypedSdk(base)).toBe(src);
  });
});

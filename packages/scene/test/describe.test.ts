/**
 * `describe()` — the machine-readable API manifest (0.18). These tests pin the
 * NO-DRIFT mechanism: each section is generated from the live registry it
 * documents, and a test fails the moment the manifest and the real API disagree.
 */
import { describe as vdescribe, expect, it } from 'vitest';
import { describe, type ApiManifest } from '../src/describe.js';
import { timeline, type TimelineBuilder } from '@glissade/core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

vdescribe('describe() manifest', () => {
  const m: ApiManifest = describe();

  it('returns a populated, JSON-serializable manifest', () => {
    expect(typeof m.version).toBe('string');
    expect(Object.keys(m.nodes).length).toBeGreaterThan(0);
    expect(m.valueTypes.length).toBeGreaterThan(0);
    expect(m.easings.length).toBeGreaterThan(0);
    expect(m.builder.methods.length).toBeGreaterThan(0);
    expect(Object.keys(m.subpaths).length).toBeGreaterThan(0);
    expect(typeof m.createScene).toBe('string');
    // round-trips through JSON unchanged (this IS what glissade.api.json commits)
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });

  it('lists every built-in node type', () => {
    expect(Object.keys(m.nodes).sort()).toEqual(['Circle', 'Group', 'Image', 'Path', 'Rect', 'Text', 'Video']);
  });

  it('tags Rect.position as an animatable vec2 target with arity 2', () => {
    expect(m.nodes.Rect!.props.position).toEqual({
      type: 'vec2',
      animatable: true,
      target: '<id>/position',
      arity: 2,
    });
  });

  it('tags Rect.cornerRadius as an animatable number', () => {
    expect(m.nodes.Rect!.props.cornerRadius).toEqual({
      type: 'number',
      animatable: true,
      target: '<id>/cornerRadius',
      arity: 1,
    });
  });

  it('shows the polymorphic Shape fill as color|paint', () => {
    expect(m.nodes.Rect!.props.fill!.type).toBe('color|paint');
    expect(m.nodes.Circle!.props.fill!.type).toBe('color|paint');
    // Text fill is a plain color string (no gradients) — color only.
    expect(m.nodes.Text!.props.fill!.type).toBe('color');
  });

  it('exposes Text.reveal as an animatable number prop', () => {
    expect(m.nodes.Text!.props.reveal).toEqual({
      type: 'number',
      animatable: true,
      target: '<id>/reveal',
      arity: 1,
    });
  });

  it('inherits the base transform targets on every node', () => {
    for (const node of Object.values(m.nodes)) {
      expect(node.props.position!.type).toBe('vec2');
      expect(node.props.rotation!.type).toBe('number');
      expect(node.props.opacity!.type).toBe('number');
    }
  });

  it('lists valueTypes from the live registry (vec2/color/paint/path present)', () => {
    for (const id of ['number', 'vec2', 'color', 'paint', 'path', 'vec2-arc']) {
      expect(m.valueTypes).toContain(id);
    }
  });

  it('lists easings from the live registry (linear + a named ease present)', () => {
    expect(m.valueTypes).not.toContain('linear'); // sanity: not a value type
    expect(m.easings).toContain('linear');
    expect(m.easings).toContain('easeInOutCubic');
  });

  it('documents the tree-shakeable subpaths', () => {
    expect(m.subpaths['@glissade/scene/path']).toMatch(/pathFromSvg/);
    expect(m.subpaths['@glissade/scene/layout']).toMatch(/Layout/);
    expect(m.subpaths['@glissade/core/clips']).toMatch(/clip/i);
  });

  // NO-DRIFT pin: every method actually exposed on the runtime TimelineBuilder
  // must appear in describe().builder. Capture the live builder surface by
  // building a throwaway timeline and reading the object the callback receives.
  it('builder method list covers the live TimelineBuilder surface', () => {
    let captured: TimelineBuilder | undefined;
    timeline((tl) => {
      captured = tl;
    });
    const liveMethods = Object.keys(captured!)
      .filter((k) => typeof (captured as unknown as Record<string, unknown>)[k] === 'function')
      .sort();
    const documented = new Set(m.builder.methods.map((x) => x.name));
    for (const name of liveMethods) {
      expect(documented.has(name)).toBe(true);
    }
    // and every documented name is a real builder method (no phantom entries)
    const live = new Set(liveMethods);
    for (const x of m.builder.methods) {
      expect(live.has(x.name)).toBe(true);
    }
  });
});

vdescribe('describe() docs-honesty', () => {
  const m = describe();

  /** Resolve a `'<id>/<prop>'` target to its prop entry in ANY node's manifest —
   * the prop part is node-type-agnostic (the same `position`/`opacity`/… targets
   * live on every node), so a docs target is honest iff some node declares it. */
  function propIsReal(prop: string): boolean {
    return Object.values(m.nodes).some((node) => prop in node.props);
  }

  it('every animatable target path used in docs/browser.md resolves in the manifest', () => {
    const md = readFileSync(join(here, '..', '..', '..', 'docs', 'browser.md'), 'utf8');
    // Pull quoted builder targets: '<word>/<prop.path>' from .to/.fromTo/.set/track.
    const targets = new Set<string>();
    for (const mt of md.matchAll(/['"]([a-zA-Z_][\w-]*)\/([a-zA-Z][\w.]*)['"]/g)) {
      // only treat it as a track target when it appears in a builder/track call
      const idx = mt.index ?? 0;
      const ctx = md.slice(Math.max(0, idx - 40), idx);
      if (/\b(?:to|fromTo|set|track|stagger)\s*\(\s*$/.test(ctx) || /\b(?:to|fromTo|set|track)\b/.test(ctx)) {
        targets.add(`${mt[1]}/${mt[2]}`);
      }
    }
    // browser.md uses at least box/position — assert we actually found targets.
    expect(targets.size).toBeGreaterThan(0);
    for (const t of targets) {
      const prop = t.slice(t.indexOf('/') + 1);
      expect(propIsReal(prop), `docs target '${t}' (prop '${prop}') not found in describe()`).toBe(true);
    }
  });
});

/**
 * `describe()` — a machine-readable API manifest (0.18), the structural antidote
 * to discoverability: an AI consumer reads GROUND TRUTH from the artifact instead
 * of reverse-engineering the surface. PURE INTROSPECTION — it instantiates each
 * built-in node once, reads its registered track targets, and enumerates the core
 * registries; it never touches `evaluate()` or any cross-frame state, so it has
 * zero determinism impact.
 *
 * The whole point is NO-DRIFT: every section is GENERATED from the live registry
 * it documents (`Node.listTargets()` → the real `registerTarget` calls,
 * `listValueTypes()` → the ValueType registry, `easings` → the easing registry),
 * so the manifest can't fall out of sync with what the framework actually does.
 * The builder method list and the subpath map are the lone curated parts (runtime
 * signatures aren't introspectable); a test pins the builder names to the
 * `TimelineBuilder` interface so even those can't silently drift.
 *
 * Tree-shakeable: this lives on its OWN module (re-exported on the
 * `@glissade/scene/describe` subpath / the `@glissade/browser` bundle), so it is
 * never pulled onto the base embed path — a scene that never calls `describe()`
 * pays zero bytes for it.
 */

import { easings, listValueTypes } from '@glissade/core';
import { Group, Rect, Circle, Path, Text, ImageNode, Video } from './nodes.js';
import { type Node } from './node.js';

// Lockstep `0.x` versioning bumps every @glissade package together, so scene's
// own version IS the glissade version. The `__GLISSADE_VERSION__` sentinel below
// is replaced at build by tsdown (from packages/scene/package.json — the single
// source of truth) so it can never drift from the published version. Unbuilt
// runs (vitest evaluating the .ts directly) keep the literal `0.0.0-dev`.
const RAW_VERSION = '__GLISSADE_VERSION__';
// When the sentinel is unreplaced (unbuilt .ts) it still contains 'GLISSADE_';
// the build substitutes a real semver, which never does — so this picks the dev
// fallback only off the build path.
const PACKAGE_VERSION = RAW_VERSION.includes('GLISSADE_'.concat('VERSION')) ? '0.0.0-dev' : RAW_VERSION;

/** One animatable / settable prop in the manifest. */
export interface DescribedProp {
  /** The §2.2 value-type id this prop accepts (e.g. `'vec2'`, `'number'`, `'color'`). */
  type: string;
  /** Whether a Track can drive it (every registered target is animatable). */
  animatable: boolean;
  /** The track-target template, `'<id>/<path>'` — substitute the node's real id. */
  target?: string;
  /** Component count of the value (`vec2` → 2, scalar → 1); omitted for non-numeric reprs. */
  arity?: number;
}

export interface DescribedNode {
  props: { [prop: string]: DescribedProp };
}

export interface DescribedBuilderMethod {
  name: string;
  signature: string;
}

/** The full machine-readable manifest `describe()` returns. */
export interface ApiManifest {
  version: string;
  nodes: { [typeName: string]: DescribedNode };
  valueTypes: string[];
  easings: string[];
  builder: { methods: DescribedBuilderMethod[] };
  createScene: string;
  subpaths: { [entry: string]: string };
}

/** Arity of a value type's numeric repr: vec2/vec2-arc → 2, number → 1; others (color/paint/path/string/boolean) carry no scalar arity. */
function arityOf(type: string): number | undefined {
  if (type === 'number') return 1;
  if (type === 'vec2' || type === 'vec2-arc') return 2;
  return undefined;
}

/**
 * Render a target's `expects` stamp to a single manifest type string. A
 * polymorphic prop (e.g. `fill` is `['color','paint']`) joins with `|`; an
 * untagged target (the 0.13 back-compat 2-arg `registerTarget`) reports
 * `'unknown'`.
 */
function expectsToType(expects: string | readonly string[] | undefined): string {
  if (expects === undefined) return 'unknown';
  return Array.isArray(expects) ? expects.join('|') : (expects as string);
}

/** Introspect one freshly-instantiated node into its prop manifest, reading the
 * REAL `registerTarget` calls via `listTargets()` (so it can't drift). */
function describeNode(node: Node): DescribedNode {
  const props: { [prop: string]: DescribedProp } = {};
  for (const { path, expects } of node.listTargets()) {
    const type = expectsToType(expects);
    const arity = arityOf(type);
    props[path] = {
      type,
      animatable: true,
      target: `<id>/${path}`,
      ...(arity !== undefined ? { arity } : {}),
    };
  }
  return { props };
}

// The built-in node taxonomy members that have a concrete class on the base scene
// index (Layout lives on the budgeted ./layout entry; Custom adds no props of its
// own). Each is instantiated ONCE with minimal props purely to read its registered
// targets — pure construction, never emitted, never evaluated.
const NODE_FACTORIES: { [typeName: string]: () => Node } = {
  Group: () => new Group(),
  Rect: () => new Rect(),
  Circle: () => new Circle(),
  Path: () => new Path(),
  Text: () => new Text(),
  Image: () => new ImageNode({ assetId: '~describe' }),
  Video: () => new Video({ assetId: '~describe' }),
};

/**
 * The curated `TimelineBuilder` surface (§2.6). Runtime signatures aren't
 * introspectable, so this is hand-kept — `describe.test.ts` pins every name here
 * to the `TimelineBuilder` interface so it can't silently drift from the API.
 */
const BUILDER_METHODS: DescribedBuilderMethod[] = [
  { name: 'to', signature: 'to<T>(target, value, opts?: { duration?, ease?, at?, from? }): TimelineBuilder' },
  { name: 'fromTo', signature: 'fromTo<T>(target, from, to, opts?: { duration?, ease?, at? }): TimelineBuilder' },
  { name: 'stagger', signature: 'stagger<T>(targets, { to, from?, duration?, ease? }, { each, anchor?, at? }): TimelineBuilder' },
  { name: 'set', signature: 'set<T>(target, value, opts?: { at? }): TimelineBuilder' },
  { name: 'label', signature: 'label(name, at?): TimelineBuilder' },
  { name: 'add', signature: "add(child, at?, opts?: { mode?: 'add'|'sync', timeScale? }): TimelineBuilder" },
  { name: 'sequence', signature: 'sequence(subs, opts?: { gap? }): TimelineBuilder' },
  { name: 'at', signature: 'at(time, sub): TimelineBuilder' },
  { name: 'call', signature: 'call(fn, at?): TimelineBuilder' },
  { name: 'cue', signature: 'cue(at, name, data?): TimelineBuilder' },
  { name: 'adBreak', signature: 'adBreak(at, opts?: { id?, duration? }): TimelineBuilder' },
  { name: 'editable', signature: 'editable(): TimelineBuilder' },
  { name: 'editableDuration', signature: 'editableDuration(): TimelineBuilder' },
];

/** One-line "what's there" for each documented tree-shakeable subpath entry. */
const SUBPATHS: { [entry: string]: string } = {
  '@glissade/core/clips': 'motion clips: clip/clipList + the popIn/slideIn/pulse/driftLoop literals, presence (enter/exit) and morph (box-FLIP) build-time sugar.',
  '@glissade/core/i18n': 'localization: requireParity (id-set diff), localize (doc→doc resolver), t() ambient-table sugar.',
  '@glissade/scene/layout': 'flexbox: the Yoga-backed Layout node + LayoutEngine (the only entry that ships Yoga wasm).',
  '@glissade/scene/path': "SVG geometry: pathFromSvg / parseSvgPathData — parse an SVG `d` string into a PathValue for Path.data.",
};

/**
 * Build the machine-readable API manifest from the live registries (§4.4). Pure
 * introspection: instantiate each built-in node once to read its registered track
 * targets, enumerate the ValueType + easing registries, and curate the builder /
 * subpath surface. JSON-serializable; safe to call any number of times.
 */
export function describe(): ApiManifest {
  const nodes: { [typeName: string]: DescribedNode } = {};
  for (const [name, factory] of Object.entries(NODE_FACTORIES)) {
    nodes[name] = describeNode(factory());
  }
  return {
    version: PACKAGE_VERSION,
    nodes,
    valueTypes: listValueTypes(),
    easings: Object.keys(easings),
    builder: { methods: BUILDER_METHODS },
    createScene: 'createScene({ size: { w, h }, children: Node[] }): Scene',
    subpaths: SUBPATHS,
  };
}

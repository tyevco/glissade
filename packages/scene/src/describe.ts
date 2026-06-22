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

/**
 * One prop in the manifest. The `animatable` flag is the load-bearing
 * distinction an AI reads to tell "animate this" from "set at construction":
 *
 * - An ANIMATABLE prop (`animatable: true`) carries a `target` — a real track
 *   target you bind via `to`/`fromTo`/`set`. Generated from `listTargets()`,
 *   so it is a registered target by construction.
 * - A CONSTRUCTION prop (`animatable: false`) has NO `target` — it is passed to
 *   the node constructor and NEVER bindable (binding it is rejected by the bind
 *   guard). `required: true` marks one you can't omit (e.g. Image `assetId`).
 *
 * This negative space is the manifest's point: it prevents an AI from
 * attempting to animate a construction-only prop (an `assetId` track, a
 * `fontFamily` tween) — those are construction-time decisions, not tracks.
 */
export interface DescribedProp {
  /** The §2.2 value-type id this prop accepts (e.g. `'vec2'`, `'number'`, `'color'`). */
  type: string;
  /** Whether a Track can drive it. `true` ⇒ a `target` is present; `false` ⇒ construction-only, no `target`. */
  animatable: boolean;
  /** The track-target template, `'<id>/<path>'` — present ONLY on animatable props; substitute the node's real id. */
  target?: string;
  /** Component count of the value (`vec2` → 2, scalar → 1); omitted for non-numeric reprs. */
  arity?: number;
  /** Construction-only props: `true` when the constructor REQUIRES it (e.g. Image/Video `assetId`). */
  required?: boolean;
}

export interface DescribedNode {
  props: { [prop: string]: DescribedProp };
  /**
   * The tree-shakeable subpath this node is imported from, when not the base
   * `@glissade/scene` index (e.g. the Layout family lives on
   * `@glissade/scene/layout`). Omitted for base-index nodes.
   */
  subpath?: string;
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

/**
 * A construction-only prop spec — a prop you pass to the node constructor that
 * is NOT a track target. Curated per node (TS Props types erase at runtime, so
 * there is no registry to read), and guarded against drift by `describe.test.ts`,
 * which CONSTRUCTS each node from exactly these names (the constructor must
 * accept them) and asserts none collides with an animatable target.
 */
interface ConstructionProp {
  type: string;
  required?: boolean;
}

/**
 * Construction-only props by node type — the difference between a node's Props
 * interface and its `registerTarget` set (its animatable props). These are set
 * once at `new Node({...})` and can never be animated.
 *
 * Base `NodeProps` construction props (`id`, `blend`, `filters`, `anchor`,
 * `cache`) are shared by EVERY node and merged in separately, so this map holds
 * only each node's OWN construction surface.
 */
const CONSTRUCTION_PROPS: { [typeName: string]: { [prop: string]: ConstructionProp } } = {
  Group: {
    children: { type: 'Node[]' },
  },
  Rect: {
    // hand-drawn look (sketch.ts) — geometry-time, not animatable
    sketch: { type: 'SketchStyle' },
    sketchFill: { type: 'HachureSpec' },
    sketchSeed: { type: 'number' },
  },
  Circle: {
    sketch: { type: 'SketchStyle' },
    sketchFill: { type: 'HachureSpec' },
    sketchSeed: { type: 'number' },
  },
  Path: {
    sketch: { type: 'SketchStyle' },
    sketchFill: { type: 'HachureSpec' },
    sketchSeed: { type: 'number' },
  },
  Text: {
    fontFamily: { type: 'string' },
    fontWeight: { type: 'number' },
    fontStyle: { type: "'normal'|'italic'" },
    align: { type: "'left'|'center'|'right'" },
    lineHeight: { type: 'number' },
  },
  Image: {
    // REQUIRED: an Image references a Timeline asset by id — you cannot
    // construct one without it. (NOT the media URL: that lives in the assets
    // manifest, keyed by this id — see createScene's `assets` shape.)
    assetId: { type: 'string', required: true },
  },
  Video: {
    assetId: { type: 'string', required: true },
    at: { type: 'number' },
    trimStart: { type: 'number' },
    playbackRate: { type: 'number' },
    clipDuration: { type: 'number' },
    sourceFps: { type: 'number' },
  },
};

/**
 * Base-`NodeProps` construction props shared by every node — set at
 * construction, never animatable (none is a registered target).
 */
const BASE_CONSTRUCTION_PROPS: { [prop: string]: ConstructionProp } = {
  id: { type: 'string' },
  blend: { type: 'BlendMode' },
  filters: { type: 'FilterSpec[]' },
  anchor: { type: 'AnchorSpec' },
  cache: { type: 'boolean' },
};

/** Introspect one freshly-instantiated node into its prop manifest: the
 * ANIMATABLE props come from the REAL `registerTarget` calls via `listTargets()`
 * (so they can't drift); the CONSTRUCTION-only props are merged from the curated
 * schema (drift-guarded by a constructor test). */
function describeNode(node: Node, typeName: string): DescribedNode {
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
  // Construction-only props: base NodeProps + this node's own. No `target`:
  // these are never bindable, and the bind guard rejects any track on them.
  const construction = { ...BASE_CONSTRUCTION_PROPS, ...(CONSTRUCTION_PROPS[typeName] ?? {}) };
  for (const [prop, spec] of Object.entries(construction)) {
    props[prop] = {
      type: spec.type,
      animatable: false,
      ...(spec.required ? { required: true } : {}),
    };
  }
  return { props };
}

/**
 * The Layout family — `Layout` and its `Stack`/`Row`/`Column` ergonomic
 * factories — lives on the budgeted `@glissade/scene/layout` entry (it ships
 * Yoga wasm), so describe() does NOT import it (that would drag Yoga onto the
 * describe/browser bundle). Instead it carries a CURATED schema, drift-guarded
 * by `describe.test.ts`, which imports the real Layout and asserts these
 * animatable props match its `listTargets()` and these construction props match
 * its constructor.
 *
 * `width`/`height` are animatable number targets; `direction`/`justify`/`align`
 * are construction-only (set once, not tweened). `children` is construction.
 */
const LAYOUT_SUBPATH = '@glissade/scene/layout';
const LAYOUT_ANIMATABLE: { [prop: string]: { type: string } } = {
  width: { type: 'number' },
  height: { type: 'number' },
  gap: { type: 'number' },
  padding: { type: 'number' },
};
const LAYOUT_CONSTRUCTION: { [prop: string]: ConstructionProp } = {
  direction: { type: "'row'|'column'" },
  justify: { type: "'start'|'center'|'end'|'space-between'|'space-around'" },
  align: { type: "'start'|'center'|'end'|'stretch'" },
  children: { type: 'Node[]' },
};

/**
 * Build a Layout-family node manifest from the curated schema. Layout is a
 * `Group` subclass, so it inherits every base transform target — reuse a
 * throwaway `Group`'s `listTargets()` for those (no drift on the inherited set),
 * then add the layout-specific animatable + construction props.
 */
function describeLayoutNode(): DescribedNode {
  // inherited base transform targets (position/rotation/scale/opacity/zIndex)
  const props = describeNode(new Group(), 'Group').props;
  delete props.children; // Layout declares its own children construction prop below
  for (const [prop, spec] of Object.entries(LAYOUT_ANIMATABLE)) {
    const arity = arityOf(spec.type);
    props[prop] = { type: spec.type, animatable: true, target: `<id>/${prop}`, ...(arity !== undefined ? { arity } : {}) };
  }
  const construction = LAYOUT_CONSTRUCTION;
  for (const [prop, spec] of Object.entries(construction)) {
    props[prop] = { type: spec.type, animatable: false, ...(spec.required ? { required: true } : {}) };
  }
  return { props, subpath: LAYOUT_SUBPATH };
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
  { name: 'stagger', signature: 'stagger<T>(targets, { to: T | ((index, count) => T), from?: T | ((index, count) => T), duration?, ease? }, { each: number | ((rank, count) => number), anchor?, at? }): TimelineBuilder' },
  { name: 'tracks', signature: 'tracks(tracks: Track[] | { tracks: Track[] }): TimelineBuilder' },
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
    nodes[name] = describeNode(factory(), name);
  }
  // The Layout family lives on @glissade/scene/layout (Yoga); describe() can't
  // import it, so a curated, drift-guarded schema gives it first-class entries.
  // Stack/Row/Column are ergonomic factories over Layout — same props, different
  // defaults — so they share its manifest verbatim.
  const layout = describeLayoutNode();
  for (const name of ['Layout', 'Stack', 'Row', 'Column']) nodes[name] = layout;
  return {
    version: PACKAGE_VERSION,
    nodes,
    valueTypes: listValueTypes(),
    easings: Object.keys(easings),
    builder: { methods: BUILDER_METHODS },
    // The full construct-a-scene surface: the size + children AND the asset
    // manifest (so Image/Video `assetId` resolves to a real media URL). An
    // `assetId` on a node names an entry in this `assets` map.
    createScene:
      "createScene({ size: { w, h }, children: Node[] }): Scene  —  media assets are declared on the Timeline document: timeline({ assets: { <id>: { kind: 'image'|'video', url } } }); an Image/Video node's `assetId` names an entry here.",
    subpaths: SUBPATHS,
  };
}

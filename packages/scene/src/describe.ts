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
import { BASE_CONSTRUCTION_PROP_NAMES, NODE_CONSTRUCTION_PROP_NAMES } from './constructionProps.js';
import { listComponents } from './component.js';

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
   * Runnable, drift-guarded code snippets for this node — present ONLY when
   * `describe({ examples: true })` is called AND `@glissade/scene/examples` has
   * been imported (it registers the corpus). Each string is an executable example
   * the doctest harness runs, so it can't go stale (§0.24 onboarding).
   */
  examples?: readonly string[];
  /**
   * What this node's `position` points at WITHOUT an explicit `anchor` (its
   * legacy origin): 'center' for shapes, 'baseline-left' for Text, etc. Override
   * with the base `anchor` prop. Surfaced so consumers stop discovering the
   * shape-vs-Text anchor mismatch by pixel-measuring.
   */
  positionAnchor: string;
  /**
   * The tree-shakeable subpath this node is imported from, when not the base
   * `@glissade/scene` index (e.g. the Layout family lives on
   * `@glissade/scene/layout`). Omitted for base-index nodes.
   */
  subpath?: string;
}

/**
 * One user-defined `defineComponent()` in the manifest (0.36) — a reusable
 * animated subscene's public prop surface, so an agent/studio sees what it
 * accepts. Generated from the LIVE component registry, so it can't drift.
 */
export interface DescribedComponent {
  name: string;
  /** the component's public props: name → { type, required? } (construction-time). */
  props: { [prop: string]: { type: string; required?: boolean } };
}

export interface DescribedBuilderMethod {
  name: string;
  signature: string;
  /** Runnable example snippets — see {@link DescribedNode.examples}. */
  examples?: readonly string[];
}

/**
 * One helper/factory in the manifest — the broader builder API beyond the node
 * taxonomy and the timeline builder. These are the free functions an AI consumer
 * reaches for (transport, motion-path, clips, snapshot, text-splitting); several
 * live ABOVE `scene` in the dep graph (player/backend), so describe() can't
 * import them — this is a CURATED literal, drift-guarded by a test that runs in a
 * package above scene (`@glissade/browser`'s smoke test) and asserts every name
 * resolves to a real `window.glissade.<name>` function.
 */
export interface DescribedHelper {
  /** The exported function name — also the `window.glissade.<name>` global on the IIFE. */
  name: string;
  /** One line: what it's for. */
  summary: string;
  /** The npm subpath to import it from (e.g. `@glissade/player`). On the IIFE it's `window.glissade.<name>`. */
  import: string;
  /** A minimal signature/usage string showing the call shape. */
  usage: string;
  /** Runnable example snippets — see {@link DescribedNode.examples}. */
  examples?: readonly string[];
}

/** The full machine-readable manifest `describe()` returns. */
export interface ApiManifest {
  version: string;
  nodes: { [typeName: string]: DescribedNode };
  valueTypes: string[];
  easings: string[];
  builder: { methods: DescribedBuilderMethod[] };
  /**
   * The curated helper/factory surface (0.20) — `createPlayer`/`mount`,
   * `motionPath`/`followPath`, `clip`/`clipList`, `renderToDataURL`/`snapshotCanvas`,
   * `splitText`, `Grid`, and the `Stack`/`Row`/`Column` layout factories. Every
   * `name` is also a `window.glissade.<name>` global on the IIFE.
   */
  helpers: DescribedHelper[];
  /** user-defined components registered via defineComponent() (0.36); present
   *  from describe() (possibly empty), absent on manifests captured before 0.36. */
  components?: DescribedComponent[];
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
 * Per-prop construction metadata (value type + `required`) for the manifest.
 * The NAME sets themselves are owned by the slim `./constructionProps` module
 * (which BOTH this file and the embed-path bind guard import); this map only
 * layers the richer per-prop type info on top of those names. `describeNode`
 * iterates the slim names and looks each one up here, so a name that exists in
 * one place but not the other is a build-time-visible bug, not silent drift.
 *
 * Base `NodeProps` construction props (`id`, `blend`, `filters`, `anchor`,
 * `cache`) are shared by EVERY node and merged in separately, so this map holds
 * only each node's OWN construction surface.
 */
const CONSTRUCTION_PROP_META: { [typeName: string]: { [prop: string]: ConstructionProp } } = {
  Group: {
    children: { type: 'Node[]' },
    // 0.34 clip region — LOCAL-space rounded rect ({w,h,r?,x?,y?}) or PathSeg[];
    // construction-only (children paint only inside it)
    clip: { type: '{ w, h, r?, x?, y? } | PathSeg[]' },
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
    box: { type: "{ valign: 'center'|'top'|'bottom', h? }" },
    lineHeight: { type: 'number' },
    // Letter-spacing (tracking) in px, threaded to every backend. Set at
    // construction (static — not a track target in 0.21).
    letterSpacing: { type: 'number' },
    // 0.20 variable-font axes (e.g. "'wght' 700, 'wdth' 80"): an OpenType
    // fontVariationSettings string threaded to the rasterizer. Set at
    // construction — a string of axis tuples isn't lerp-able, so it is NOT a
    // track target (binding it is rejected by the bind guard).
    fontVariationSettings: { type: 'string' },
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
 * Per-prop type metadata for the shared base `NodeProps` construction props —
 * set at construction, never animatable. The NAME set lives in the slim
 * `./constructionProps` module (`BASE_CONSTRUCTION_PROP_NAMES`); this just maps
 * each shared name to its manifest value type.
 */
const BASE_CONSTRUCTION_PROP_META: { [prop: string]: ConstructionProp } = {
  id: { type: 'string' },
  blend: { type: 'BlendMode' },
  filters: { type: 'FilterSpec[]' },
  // The position anchor + rotation/scale pivot. Presets enumerated (not the
  // opaque `AnchorSpec` name) so the fix for the Rect-center/Text-top-left
  // mismatch is discoverable: set `anchor:'top-left'` and `position` means the
  // box's top-left on every node. Each node's DEFAULT (no anchor) is in
  // `nodes.<T>.positionAnchor`.
  anchor: { type: "'center'|'top-left'|'top'|'top-right'|'left'|'right'|'bottom-left'|'bottom'|'bottom-right'|[ax,ay]" },
  cache: { type: 'boolean' },
};

/**
 * What an unanchored node's `position` POINTS AT (its legacy origin). Shapes are
 * box-centered; Text sits at the baseline-left; Path uses the author's path
 * coords. Surfaced per node so a consumer aligning a card + its label stops
 * pixel-measuring the mismatch — and knows `anchor` (above) overrides it.
 */
const POSITION_ANCHOR: { [typeName: string]: string } = {
  Rect: 'center',
  Circle: 'center',
  Image: 'center',
  Video: 'center',
  Text: 'baseline-left',
  Path: 'author-coords',
  Group: 'none (no intrinsic box — anchor warns and is ignored)',
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
  // Iterate the slim NAME sets (the shared source of truth) and look each name's
  // value type up in the metadata map; a missing entry is a wiring bug.
  const ownNames = NODE_CONSTRUCTION_PROP_NAMES[typeName] ?? [];
  const meta = { ...BASE_CONSTRUCTION_PROP_META, ...(CONSTRUCTION_PROP_META[typeName] ?? {}) };
  for (const prop of [...BASE_CONSTRUCTION_PROP_NAMES, ...ownNames]) {
    const spec = meta[prop];
    if (spec === undefined) throw new Error(`describe(): construction prop '${typeName}/${prop}' has no type metadata`);
    props[prop] = {
      type: spec.type,
      animatable: false,
      ...(spec.required ? { required: true } : {}),
    };
  }
  return { props, positionAnchor: POSITION_ANCHOR[typeName] ?? 'center' };
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
// Type metadata for the Layout construction props; the NAME set is the slim
// module's `Layout` entry, kept in lockstep by describe.test.ts.
const LAYOUT_CONSTRUCTION_META: { [prop: string]: ConstructionProp } = {
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
  // Layout overrides draw() wholesale (flex placement) and does not emit the
  // Group clip — don't advertise a prop it would reject (0.34; Layout clip is a
  // possible follow-up once its draw path brackets a region)
  delete props['clip'];
  for (const [prop, spec] of Object.entries(LAYOUT_ANIMATABLE)) {
    const arity = arityOf(spec.type);
    props[prop] = { type: spec.type, animatable: true, target: `<id>/${prop}`, ...(arity !== undefined ? { arity } : {}) };
  }
  for (const prop of NODE_CONSTRUCTION_PROP_NAMES.Layout ?? []) {
    const spec = LAYOUT_CONSTRUCTION_META[prop];
    if (spec === undefined) throw new Error(`describe(): Layout construction prop '${prop}' has no type metadata`);
    props[prop] = { type: spec.type, animatable: false, ...(spec.required ? { required: true } : {}) };
  }
  return { props, positionAnchor: 'top-left', subpath: LAYOUT_SUBPATH };
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
  { name: 'to', signature: "to<T>(target, value, opts?: { duration?, ease?, at?, from?, type? }): TimelineBuilder  —  type is the value-type escape hatch (e.g. { type: 'fontAxes' } for a { wght } map inferValueType can't name)" },
  { name: 'fromTo', signature: 'fromTo<T>(target, from, to, opts?: { duration?, ease?, at?, type? }): TimelineBuilder' },
  { name: 'stagger', signature: 'stagger<T>(targets, { to: T | ((index, count) => T), from?: T | ((index, count) => T), duration?, ease? }, { each: number | ((rank, count) => number), anchor?, at? }): TimelineBuilder' },
  { name: 'tracks', signature: 'tracks(tracks: Track[] | { tracks: Track[] }): TimelineBuilder' },
  { name: 'set', signature: 'set<T>(target, value, opts?: { at?, type? }): TimelineBuilder' },
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

/**
 * The curated helper/factory surface (0.20). These are the free functions the
 * discovery doc surfaces beyond the node taxonomy + timeline builder — transport,
 * motion-path sampling, motion clips, frame snapshot, text splitting. Several live
 * ABOVE `scene` in the dep graph (player / backend-canvas2d), so describe() CANNOT
 * import them — this literal is curated by hand and drift-guarded by a test that
 * runs in a package above scene (`@glissade/browser`'s smoke test), which asserts
 * every `name` here resolves to a real `window.glissade.<name>` function on the
 * IIFE. Copy is kept verbatim from `docs/discovery.md` so docs and manifest agree.
 */
const HELPERS: DescribedHelper[] = [
  {
    name: 'measureWrappedText',
    summary:
      'Measure how a STRING wraps to a width — size a bubble/card to wrapped text WITHOUT a Text node or re-implementing line breaking (uses the renderer\'s own wrapper). For a Text NODE, use text.measuredSize(measurer)/lineBoxes(measurer)/wordBoxes(measurer) instead.',
    import: '@glissade/scene',
    usage:
      'scene.measureWrappedText(text, font, width, lineHeight = 1.25): { width, lines: string[], height, ascent, descent }  —  node-free; or measureWrappedText(text, font, width, lineHeight, measurer) standalone. width<=0 = no wrap (only explicit \\n). Text node analogue: text.measuredSize(measurer) -> { w, h }.',
  },
  {
    name: 'createPlayer',
    summary:
      'Build the transport object (play / pause / seek / rate / loop / marker + cue callbacks) directly — what mount() returns as mounted.player.',
    import: '@glissade/player',
    usage:
      "createPlayer({ playhead: createPlayhead(), duration: 2 }, { loop?: boolean }): Player  —  player.play() → { finished }, player.pause(), player.seek(u), player.rate = 2, player.onMarker(name, cb), player.onCue(kind, cb)",
  },
  {
    name: 'mount',
    summary:
      'The one-call embed: builds the player, the backend, the rAF render loop, and font handling for you — start here. Returns { player } among other handles.',
    import: '@glissade/player',
    usage: 'mount(scene, timeline, canvas, opts?: { loop?: boolean }): { player: Player, ... }',
  },
  {
    name: 'motionPath',
    summary:
      'Build an arc-length sampler over a path — a pure, deterministic table you read points and tangents from by normalized progress (constant speed, not bezier parameter).',
    import: '@glissade/scene/motion',
    usage: 'motionPath(path: PathValue): { length, atProgress(u): [x,y], tangentAtProgress(u): [x,y] }',
  },
  {
    name: 'followPath',
    summary:
      'A companion node that makes a target ride a path as an animatable — it owns the target position (and rotation with orient) and exposes a progress you drive with a track.',
    import: '@glissade/scene/motion',
    usage: "followPath(target: Node, path: Node, opts?: { id?, orient?: boolean }): FollowPath  —  drive '<id>/progress' with a track",
  },
  {
    name: 'orientToPath',
    summary:
      "The rotation-only sibling of followPath: owns a target's rotation, banking it to the path tangent at progress, while POSITION is left to whatever drives it (keyframes, layout, a sibling followPath). Pure, tree-shakeable.",
    import: '@glissade/scene/motion',
    usage: "orientToPath(target: Node, path: PathValue | Path, opts?: { id?, progress?, offset?: number }): OrientToPath  —  drive '<id>/progress' with a track",
  },
  {
    name: 'lookAt',
    summary:
      "A driver node that owns a target's rotation, aiming its local +x axis at another node's world origin — a turret tracking a mover, an arrow pointing at a label. Re-derives from both positions each frame; no stored state.",
    import: '@glissade/scene/motion',
    usage: 'lookAt(target: Node, at: Node, opts?: { id?, offset?: number }): LookAt',
  },
  {
    name: 'echo',
    summary:
      'Motion trails / onion-skin: wrap a child so it renders at K past playhead offsets (t − i·spacing), each trailing copy fading by decay. A pure multi-time re-eval (the playhead is re-addressed per copy and restored), byte-stable in the golden corpus. Add the returned Echo to the scene.',
    import: '@glissade/scene',
    usage: 'echo(child: Node, opts?: { id?, count?: number, spacing?: number, decay?: number }): Echo',
  },
  {
    name: 'motionBlur',
    summary:
      'Real sampled motion blur: wrap a child so it renders at N sub-frame times across a shutter interval (centered on the frame) and AVERAGES them — tracks every animated prop, not a faked directional blur. A pure multi-time re-eval (playhead re-addressed per sample, running-mean opacity, restored), byte-exact on Skia; browser↔Skia is perceptual-tier for blur.',
    import: '@glissade/scene',
    usage: 'motionBlur(child: Node, opts?: { id?, shutter?: number, samples?: number }): MotionBlur',
  },
  {
    name: 'trackMatte',
    summary:
      "Track-matte: mask CONTENT by a MATTE layer's alpha (default) or luminance ('luma'). Content renders into an isolated layer, then the matte composites destination-in — pixels survive only where the matte is opaque. Both subtrees animate like ordinary nodes (a sliding shape wipes text in, a scaling blob irises a photo). Byte-exact on Skia; browser-vs-Skia pixel parity is perceptual at anti-aliased matte edges; backend-dom (preview tier) degrades with data-approx.",
    import: '@glissade/scene',
    usage: "trackMatte(content: Node, matte: Node, opts?: { id?, mode?: 'alpha' | 'luma' }): TrackMatte",
  },
  {
    name: 'clip',
    summary:
      'A reusable, target-agnostic motion captured once as a relative-time key schedule, then applied to a node at a wall-clock start time. Build-time sugar: clip.apply() compiles to ordinary Track[].',
    import: '@glissade/core/clips',
    usage: "clip({ channels: { <name>: { path, keys: [key(t, value, ease?)] } } }): Clip  —  clip.apply(nodeId, startT) → { tracks, end }",
  },
  {
    name: 'clipList',
    summary: 'Fan one clip across many targets, staggered, in a single call — returns the combined Track[].',
    import: '@glissade/core/clips',
    usage: 'clipList(clip: Clip, targets: string[], startT: number, opts?: { stagger?: number }): { tracks }',
  },
  {
    name: 'retime',
    summary:
      'Retime a set of tracks by remapping their key TIMES — speed (slow-mo/fast), shift (delay/advance), reverse, or pingpong — as a pure build-time transform to ordinary retimed Track[]. Reverse/pingpong time-mirror each ease exactly (built-ins + cubicBezier); springs/holds fail loud.',
    import: '@glissade/core',
    usage: 'retime(tracks: Track[], { speed?, shift?, reverse?, pingpong? }): Track[]',
  },
  {
    name: 'renderToDataURL',
    summary:
      'Capture a single frame as a PNG/WebP data URL — evaluate → render → data-URL, the no-build screenshot DX helper. Browser-only.',
    import: '@glissade/backend-canvas2d/snapshot',
    usage: 'renderToDataURL(scene, timeline, t, opts?): string  (data: URL)',
  },
  {
    name: 'snapshotCanvas',
    summary: 'Render a single frame onto a canvas you pass in (the lower-level primitive renderToDataURL is built on). Browser-only.',
    import: '@glissade/backend-canvas2d/snapshot',
    usage: 'snapshotCanvas(scene, timeline, t, canvas, opts?): void',
  },
  {
    name: 'splitText',
    summary:
      'Split a Text node into per-word / per-line / per-grapheme parts you can animate individually (kinetic typography). Pass { measurer } (or call setTextMeasurer first) so part geometry uses the real backend, not the estimating fallback. Tree-shaken off the base scene index.',
    import: '@glissade/scene/type',
    usage:
      "splitText(text: Text | TextProps, opts?: { by?: 'word'|'line'|'grapheme', id?: string, measurer?: TextMeasurer }): { node: Group, children: Text[], parts: SplitPart[], targets(prop): string[] }",
  },
  {
    name: 'fitText',
    summary:
      'Shrink-to-fit: set a Text\'s fontSize to the largest that wraps within maxW to <= maxLines / <= maxH (a build-time binary search over the measurer, like Grid/splitText). Fails loud if it can\'t fit even at minPx (or pass onOverflow:\'clamp\'). Pass { measurer } for exact fit. Tree-shaken off the base scene index.',
    import: '@glissade/scene/type',
    usage: "fitText(text: Text, opts: { maxW: number, maxH?, maxLines?, minPx?, onOverflow?: 'throw'|'clamp', measurer? }): Text",
  },
  {
    name: 'fitTextSize',
    summary:
      'Like fitText but returns just the fitted fontSize (number) — apply it yourself instead of mutating the Text. The primitive fitText/fitTextGroup build on. On the @glissade/scene/type subpath.',
    import: '@glissade/scene/type',
    usage: 'fitTextSize(text: Text, opts: { maxW: number, maxH?, maxLines?, minPx?, onOverflow?, measurer? }): number',
  },
  {
    name: 'fitTextGroup',
    summary:
      'Fit several Texts to ONE shared fontSize (the largest at which every one fits its box) so a row/list of labels renders uniformly — kills the ragged \'same list, three sizes\' bug. Returns the shared size. On the @glissade/scene/type subpath.',
    import: '@glissade/scene/type',
    usage: 'fitTextGroup(texts: Text[], opts: { maxW: number, minPx?, measurer? }): number',
  },
  {
    name: 'Grid',
    summary:
      'Build-time CSS-grid-style track resolver: position plain children into a column grid (fr/px tracks + gaps), returning a Group. Pure fan-out (no Yoga, no new target) — the goldens hold by construction. Tree-shaken off the base scene index.',
    import: '@glissade/scene/grid',
    usage:
      'Grid({ columns: number | (number | { fr })[], children: Node[], gap?, columnGap?, rowGap?, cellHeight?, width? }): Group  —  child[i] → row floor(i/cols), col i%cols',
  },
  {
    name: 'Chart',
    summary:
      'Build-time bar chart: bind a table (rows) → positioned+sized Rect bars, each pinned to the axis and grown from its base, returning a Group. Pure fan-out (like Grid) — animate a reveal with tl.stagger(chart.targets("height"), …) or a colour sweep on "fill". Tree-shaken off the base scene index.',
    import: '@glissade/scene/chart',
    usage:
      "Chart({ id, data: Row[], xKey, yKey, width, height, yScale?, bandPadding?, fill?: string | ColorScale }): { node: Group, bars: Rect[], targets(prop): string[] }",
  },
  {
    name: 'defineComponent',
    summary:
      'Define a reusable, typed, describe()-legible animated subscene — the user-defined generalization of Grid/Chart. Returns a factory (props & { id }) => { node, childId, targets }; each instance namespaces its children under the required id so N instances never collide track targets. Pure build-time. describe().components lists every one defined. On the @glissade/scene/component subpath.',
    import: '@glissade/scene/component',
    usage:
      'defineComponent({ name, props: { <p>: { type, required? } }, build(props, childId): Group }): (props & { id }) => { node: Group, id, childId(sub?), targets(child, prop) }',
  },
  {
    name: 'Gauge',
    summary:
      'Build-time radial gauge (data-viz, like Chart): a spec → N categorical stroked-arc zones + boundary ticks + a needle + separate labels, returning a Group. Angle deg: 0=up, +=clockwise. Needle takes AUTHORED keys (tl on targets("needle","rotation")) OR value→angle (Meter mode). Zones/ticks/needle/labels are each addressable sub-ids (zone-{i}, tick-{i}, needle, label-{i}, glow); labels draw z-above zones so a zone dim never crushes a label. Tree-shaken off the base scene index.',
    import: '@glissade/scene/gauge',
    usage:
      "Gauge({ id, radius, zones: { extent: [start,end], color, label?, labelStyle?: { family?, size?, fill?, weight? } }[], thickness?, gap?, needle?, needleAngle?, value?, domain?, sweep?, ticks?, apexEmphasis?: boolean | number, glow?: boolean | { color?, radius?, blur? }, position? }): { node: Group, id, childId(sub?), targets(sub, prop): string[] }",
  },
  {
    name: 'Meter',
    summary:
      'The Gauge value preset: a value (or () => value signal) mapped through domain across the sweep → the needle angle. Same result shape + sub-ids as Gauge. A function value binds live (the needle follows the signal). On the @glissade/scene/gauge subpath.',
    import: '@glissade/scene/gauge',
    usage:
      'Meter({ id, radius, zones, value: number | (() => number), domain?, sweep?, … }): { node: Group, id, childId, targets }',
  },
  {
    name: 'linearScale',
    summary:
      'A serializable linear scale (value axis): maps a numeric domain onto a pixel/unit range. Pair with Chart({ yScale }). On the @glissade/scene/chart subpath.',
    import: '@glissade/scene/chart',
    usage: 'linearScale(domain: [number, number], range: [number, number]): Scale',
  },
  {
    name: 'logScale',
    summary:
      'A serializable base-10 log scale (strictly-positive domain; throws otherwise) for a value axis. Pair with Chart({ yScale }). On the @glissade/scene/chart subpath.',
    import: '@glissade/scene/chart',
    usage: 'logScale(domain: [number, number], range: [number, number]): Scale',
  },
  {
    name: 'bandScale',
    summary:
      'A categorical band scale: N equal bands across a range with a padding gap, each with a bandwidth. Chart uses this internally for the x axis; exposed for custom layouts. On the @glissade/scene/chart subpath.',
    import: '@glissade/scene/chart',
    usage: 'bandScale(count: number, range: [number, number], padding?: number): BandScale',
  },
  {
    name: 'colorRamp',
    summary:
      'A serializable colour ramp (>=2 hex stops, sRGB-interpolated) over a numeric domain → a #rrggbb string. Pass as Chart({ fill }) to colour bars by value. On the @glissade/scene/chart subpath.',
    import: '@glissade/scene/chart',
    usage: 'colorRamp(stops: string[], domain?: [number, number]): ColorScale',
  },
  {
    name: 'Stack',
    summary:
      'Yoga-flexbox layout factory (column by default) — a Layout subclass that stacks children with gap/padding/justify/align. Needs loadYogaLayoutEngine() before mount/render. On the @glissade/scene/layout subpath.',
    import: '@glissade/scene/layout',
    usage: "Stack({ children, direction?: 'row'|'column', gap?, padding?, justify?, align? }): Layout",
  },
  {
    name: 'Row',
    summary:
      'Yoga-flexbox layout factory pinned to direction:"row" — children laid out horizontally. Needs loadYogaLayoutEngine() before mount/render. On the @glissade/scene/layout subpath.',
    import: '@glissade/scene/layout',
    usage: 'Row({ children, gap?, padding?, justify?, align? }): Layout',
  },
  {
    name: 'Column',
    summary:
      'Yoga-flexbox layout factory pinned to direction:"column" — children laid out vertically. Needs loadYogaLayoutEngine() before mount/render. On the @glissade/scene/layout subpath.',
    import: '@glissade/scene/layout',
    usage: 'Column({ children, gap?, padding?, justify?, align? }): Layout',
  },
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
export interface DescribeOptions {
  /**
   * Attach runnable example snippets (per node / builder method / helper) from
   * the registered corpus (§0.24 onboarding). The corpus is registered by
   * importing `@glissade/scene/examples`, kept OFF the base index so it costs
   * nothing when unused. With no corpus registered, `examples: true` is a no-op
   * (the manifest is byte-identical to `describe()`).
   */
  examples?: boolean;
}

/**
 * The registered runnable-example corpus, keyed by describe-key (node type name /
 * builder method name / helper name). Populated by `@glissade/scene/examples` at
 * import time via {@link registerExamples} — describe NEVER statically imports the
 * corpus, so the base index and the IIFE never pay for it (the value-type-registry
 * pattern). Empty until that subpath is loaded.
 */
let exampleCorpus: { readonly [key: string]: readonly string[] } = {};

/**
 * Register the runnable-example corpus — called by `@glissade/scene/examples` on
 * import. A registration hook (not a static import) so `describe()` stays lean.
 */
export function registerExamples(corpus: { readonly [key: string]: readonly string[] }): void {
  exampleCorpus = corpus;
}

function mapComponentProps(props: { readonly [prop: string]: { type: string; required?: boolean } }): {
  [prop: string]: { type: string; required?: boolean };
} {
  const out: { [prop: string]: { type: string; required?: boolean } } = {};
  for (const [k, v] of Object.entries(props)) {
    out[k] = { type: v.type, ...(v.required ? { required: true } : {}) };
  }
  return out;
}

export function describe(opts: DescribeOptions = {}): ApiManifest {
  // examples attach only when explicitly requested AND a corpus is registered;
  // otherwise the manifest is byte-identical to the legacy zero-arg form.
  const withEx = opts.examples === true && Object.keys(exampleCorpus).length > 0;
  const ex = (key: string): { examples: readonly string[] } | undefined => {
    const e = withEx ? exampleCorpus[key] : undefined;
    return e && e.length > 0 ? { examples: e } : undefined;
  };

  const nodes: { [typeName: string]: DescribedNode } = {};
  for (const [name, factory] of Object.entries(NODE_FACTORIES)) {
    const node = describeNode(factory(), name);
    nodes[name] = { ...node, ...ex(name) };
  }
  // The Layout family lives on @glissade/scene/layout (Yoga); describe() can't
  // import it, so a curated, drift-guarded schema gives it first-class entries.
  // Stack/Row/Column are ergonomic factories over Layout — same props, different
  // defaults — so they share its manifest verbatim.
  const layout = describeLayoutNode();
  for (const name of ['Layout', 'Stack', 'Row', 'Column']) {
    const e = ex(name);
    nodes[name] = e ? { ...layout, ...e } : layout;
  }
  return {
    version: PACKAGE_VERSION,
    nodes,
    valueTypes: listValueTypes(),
    easings: Object.keys(easings),
    builder: { methods: withEx ? BUILDER_METHODS.map((m) => ({ ...m, ...ex(m.name) })) : BUILDER_METHODS },
    // The curated helper/factory surface (transport, motion-path, clips,
    // snapshot, splitText) — several live above scene in the dep graph, so this
    // is a hand-kept literal, drift-guarded by @glissade/browser's smoke test.
    helpers: withEx ? HELPERS.map((h) => ({ ...h, ...ex(h.name) })) : HELPERS,
    // 0.36: user-defined components from the live registry (empty by default)
    components: listComponents().map((c) => ({ name: c.name, props: mapComponentProps(c.props) })),
    // The full construct-a-scene surface: the size + children AND the asset
    // manifest (so Image/Video `assetId` resolves to a real media URL). An
    // `assetId` on a node names an entry in this `assets` map.
    createScene:
      "createScene({ size: { w, h }, children: Node[] }): Scene  —  media assets are declared on the Timeline document: timeline({ assets: { <id>: { kind: 'image'|'video', url } } }); an Image/Video node's `assetId` names an entry here.",
    subpaths: SUBPATHS,
  };
}

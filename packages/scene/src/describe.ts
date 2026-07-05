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
  /**
   * 0.59 F "manifest conventions": the physical UNIT of the value, when one
   * applies — e.g. `'degrees'` for rotation, `'seconds'` for a Video time offset.
   * ADDITIVE + curated (a small per-prop table, like `positionAnchor`), present
   * ONLY where a unit is meaningful; absent for unitless/px props. Lets a
   * consumer stop guessing whether `rotation` is degrees or radians.
   */
  unit?: string;
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
   * 0.59 F ride-along "type-level bindable discovery aid": the prop names on this
   * node a Track CAN drive (i.e. the animatable ones) — a flat, at-a-glance list
   * so a consumer sees the bindable surface without filtering `props`. GENERATED
   * from the same `listTargets()` the animatable props are, so it can't drift.
   * This is the TYPE-level "can be animated" aid; the INSTANCE-level "is CURRENTLY
   * bound on THIS node" truth (the anti-false-conclusion guard) is
   * `instanceProps(node).bound` on `@glissade/scene/diagnostics`. Optional so a
   * manifest captured before 0.59 (no `bindable`) still type-checks.
   */
  bindable?: string[];
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
 * One whole-scene starter RECIPE in the manifest (0.63) — a PATTERN an agent
 * discovers the way it discovers node PRIMITIVES, then instantiates via
 * `recipe(name, props)`. Its typed props carry a `default` (every recipe is
 * clean-by-construction at defaults). Populated from the LIVE recipe registry (the
 * `@glissade/scene/recipes` subpath registers on import), so it can't drift; empty
 * on a manifest captured without that subpath loaded.
 */
export interface DescribedRecipe {
  /** The recipe name — pass to `recipe(name, props)`. */
  name: string;
  /** One line: what scaffold it lays down. */
  summary?: string;
  /** the recipe's typed props: name → { type, required?, default? }. */
  props: { [prop: string]: { type: string; required?: boolean; default?: unknown } };
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
  /**
   * 0.59 F/E "manifest conventions": `true` when this helper needs a real text
   * MEASURER for correct geometry (splitText/fitText/…). Without one it degrades
   * to a rough per-character estimate (or, with `{ requireMeasurer: true }`,
   * throws) — so a consumer knows to pass `{ measurer }` / call setTextMeasurer()
   * first. Absent (⇒ not measurer-dependent) for every other helper.
   */
  requiresMeasurer?: boolean;
}

/**
 * One entry in the {@link ApiManifest.surface} taxonomy (0.47 "verifiable
 * ground-truth"): a single window.glissade export, tagged with how a consumer
 * reaches it. This is the ONE machine-readable truth for the IIFE surface that
 * both `gs describe --lint` (the drift guard vs the real `@glissade/browser`
 * bundle) and `gs types --global` (the ambient `window.glissade` `.d.ts`) read —
 * so the curated helper/node lists can't silently drift from what actually ships
 * on `window.glissade`, and the no-build author gets a typed global surface.
 */
export interface SurfaceEntry {
  /** The export name — also the `window.glissade.<name>` global on the IIFE. */
  name: string;
  /**
   * `'value'` = a runtime binding on the bundle (a class / function / object);
   * `'type'` = a TS type-only name that erases at runtime (opaque, referenced by
   * signatures); `'diagnostic'` = a runtime AUTHORING-DIAGNOSTIC function
   * (`critique`/`validateScene`/`resolveAt`/`instanceProps`/`exportFidelity`) — a
   * real `window.glissade.<name>` callable that reports PROBLEMS (self-check tooling),
   * not scene-building surface; `'tool'` (0.61) = a runtime OPERATION function
   * (`diff`) that transforms/compares scenes and returns a RESULT (a ChangeSet), not
   * a problem list — distinct from a diagnostic so a consumer never misuses its
   * output as a defect report. A scalable CATEGORY (diagnostics=problems /
   * tools=operations / values=authoring surface): an agent BUILDING a scene filters
   * `kind === 'value'`; a self-check agent filters `kind === 'diagnostic'`.
   */
  kind: 'value' | 'type' | 'diagnostic' | 'tool';
  /** `true` when it is reachable as `window.glissade.<name>` on the single-file IIFE bundle. */
  iife: boolean;
  /** How to consume it: `'constructor'` needs `new`, `'function'` is a plain call, `'object'` is a value namespace (e.g. `easings`), `'type'` is type-only. */
  form: 'constructor' | 'function' | 'object' | 'type';
  /** Documented positional-arg count for a callable (parsed from its usage), when known — absent for value objects and types. */
  arity?: number;
  /**
   * 0.63.1 — the OPTIONS schema for an opts-taking callable (the `opts` arg is
   * otherwise opaque, so a no-build agent can't discover `minLegiblePx` /
   * `exportBound` / …). Present only where a curated schema exists (`assess`,
   * `critique`). Each entry: the option `name`, its `type` string (a value-type id
   * or `'string[]'` / an opaque type name), an optional literal `default`, and a
   * one-line `summary`. ADDITIVE — a manifest captured before 0.63.1 omits it.
   */
  options?: SurfaceOption[];
}

/** One entry in a {@link SurfaceEntry.options} schema — a single documented `opts`
 *  field on an options-taking callable. */
export interface SurfaceOption {
  name: string;
  type: string;
  default?: string | number | boolean;
  summary: string;
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
  /**
   * 0.63 starter-scaffold RECIPES an agent instantiates via `recipe(name, props)`.
   * Populated from the live registry the `@glissade/scene/recipes` subpath registers
   * on import (the examples-corpus pattern) — empty until that subpath is loaded, so
   * a manifest captured without it omits the recipes. ADDITIVE + off the base embed.
   */
  recipes?: DescribedRecipe[];
  createScene: string;
  subpaths: { [entry: string]: string };
  /**
   * (0.47 "verifiable ground-truth") The window.glissade runtime SURFACE taxonomy:
   * one machine-readable enumeration of every export a no-build `<script src>`
   * author reaches on the IIFE — node constructors, helper/factory functions, the
   * core callables (`timeline`/`createScene`/`track`/`evaluate`/…), value objects
   * (`easings`), and the opaque type-only names signatures reference. PURELY
   * ADDITIVE + generated from the same curated registries the rest of the manifest
   * is (so it can't drift), and OFF the base embed (describe is tree-shaken off the
   * base scene index) — zero determinism/render-path cost. Consumed by
   * `gs describe --lint` and `gs types --global`. Optional so a manifest captured
   * before 0.47 (no `surface`) still type-checks.
   */
  surface?: SurfaceEntry[];
  /**
   * 0.63.1 — pointers to the prose GUIDES that live alongside the package (the
   * author→verify→fix loop et al.), so a no-build agent discovers them from the
   * manifest instead of hunting the docs site. Each entry: a `name`, a one-line
   * `summary`, and an `href` into the docs. ADDITIVE — omitted on a manifest
   * captured before 0.63.1.
   */
  guides?: { name: string; summary: string; href: string }[];
}

/**
 * Parse the documented positional-arg count from a helper `usage` string — the
 * count of top-level comma-separated params in its FIRST `(...)` call group
 * (depth-tracked so nested `()`/`[]`/`{}`/`<>` in a param type don't miscount).
 * Used to stamp {@link SurfaceEntry.arity} and to drift-check runtime arity.
 */
export function usageArity(usage: string): number | undefined {
  const open = usage.indexOf('(');
  if (open < 0) return undefined;
  let depth = 0;
  const params: string[] = [];
  let cur = '';
  for (let i = open; i < usage.length; i++) {
    const c = usage[i]!;
    if (c === '(' || c === '[' || c === '{' || c === '<') {
      depth++;
      if (depth === 1) continue; // the opening paren of the call group itself
    } else if (c === ')' || c === ']' || c === '}' || c === '>') {
      depth--;
      if (depth === 0) {
        if (cur.trim()) params.push(cur);
        break;
      }
    }
    if (depth === 1 && c === ',') {
      params.push(cur);
      cur = '';
      continue;
    }
    if (depth >= 1) cur += c;
  }
  return params.filter((p) => p.trim().length > 0).length;
}

/**
 * The window.glissade CONSTRUCTOR nodes — reached with `new` (`new glissade.Rect(…)`).
 * The layout FACTORIES (Stack/Row/Column) + the build-time fan-outs (Grid/Chart/…)
 * are plain calls and live in {@link HELPERS}, so they aren't here.
 */
const SURFACE_CONSTRUCTORS = ['Group', 'Rect', 'Circle', 'Path', 'Text', 'Image', 'Video', 'Layout'];

/**
 * The core callables that are `window.glissade.<name>` globals but are neither a
 * node constructor nor a curated {@link HELPERS} factory — the authoring entry
 * points (`timeline`/`createScene`/`track`/`evaluate`/`stagger`) + `describe`
 * itself. `arity` is the documented positional-arg count.
 */
const SURFACE_CORE: { name: string; arity: number }[] = [
  { name: 'timeline', arity: 1 },
  { name: 'createScene', arity: 1 },
  { name: 'track', arity: 3 },
  { name: 'evaluate', arity: 3 },
  { name: 'stagger', arity: 3 },
  { name: 'describe', arity: 0 },
];

/**
 * The remaining authoring `window.glissade.<name>` FUNCTIONS beyond the node
 * constructors / {@link HELPERS} / {@link SURFACE_CORE} — the fundamentals a
 * no-build author reaches for that had no home in the curated lists: the core
 * primitives (`key`/`signal`/`spring`/`cubicBezier`/`namedEasing`/`springTo`), the
 * SVG-path parser (`pathFromSvg`), and the motion/clip-tier helpers
 * (`glow`/`morph`/`typewriter`/`pulse`/`popIn`/`slideIn`/`presence`/`highlight`).
 * Their ABSENCE red-lined valid no-build code (`track('x/o','number',[key(0,0)])`)
 * under the ambient .d.ts; the bidirectional describe-lint gate now keeps this set
 * complete (a public window.glissade export MUST be surfaced or explicitly exempt).
 * `arity` = the runtime `Function.length` (informational).
 */
const SURFACE_EXTRA: { name: string; arity: number }[] = [
  { name: 'key', arity: 3 },
  { name: 'signal', arity: 2 },
  { name: 'spring', arity: 1 },
  { name: 'cubicBezier', arity: 4 },
  { name: 'namedEasing', arity: 1 },
  { name: 'springTo', arity: 4 },
  { name: 'pathFromSvg', arity: 1 },
  { name: 'glow', arity: 1 },
  { name: 'morph', arity: 4 },
  { name: 'typewriter', arity: 2 },
  { name: 'pulse', arity: 1 },
  { name: 'popIn', arity: 1 },
  { name: 'slideIn', arity: 2 },
  { name: 'presence', arity: 2 },
  { name: 'highlight', arity: 1 },
];

/** Value exports that are runtime OBJECTS (not callable): the easing registry. */
const SURFACE_VALUE_OBJECTS = ['easings'];

/**
 * The 0.60 machine-readable AUTHORING-DIAGNOSTIC functions on `window.glissade`
 * (the `@glissade/scene/diagnostics` subpath, IIFE-re-exported off the base embed):
 * `critique` (rendered geometry), `validateScene` (static structure), `resolveAt`
 * (the truthful read primitive), `instanceProps` (instance-bound state). Marked
 * `kind: 'diagnostic'` so a consumer can PARTITION the surface — build-a-scene
 * tooling filters them OUT, render-critique/perception tooling filters them IN —
 * instead of them being invisible (previously exempt-internal, discoverable only by
 * reading the bundle). `arity` = the documented required positional-arg count.
 */
const SURFACE_DIAGNOSTICS: { name: string; arity: number }[] = [
  { name: 'critique', arity: 2 },
  { name: 'validateScene', arity: 2 },
  { name: 'resolveAt', arity: 3 },
  { name: 'instanceProps', arity: 1 },
  // 0.61: the static render-only export-fidelity scan (kind:'diagnostic', source:'parity').
  { name: 'exportFidelity', arity: 1 },
];

/**
 * 0.61 machine-readable TOOL functions on `window.glissade` — runtime OPERATIONS
 * that transform/compare scenes and return a RESULT, not a problem list. `diff(a,b)`
 * returns a ChangeSet (the blast-radius of an edit). Marked `kind:'tool'` so a
 * consumer never treats its output as a diagnostic (no severity/defect semantics).
 * `arity` = the documented required positional-arg count.
 */
const SURFACE_TOOLS: { name: string; arity: number }[] = [
  { name: 'diff', arity: 2 },
  // 0.62: certKey(scene, timeline?) — the pure semantic content-address (= the
  // scene+timeline half of the render certificate). An OPERATION returning an
  // ADDRESS (the "will this be a cache hit?" primitive), not a problem list — so
  // kind:'tool' like diff, never kind:'diagnostic'. Consistent with diff by
  // construction (shared canonicalization). timeline is optional (arity 1 required).
  { name: 'certKey', arity: 1 },
  // 0.62: the two halves of certKey, exposed so an author can inspect WHICH half
  // (scene vs timeline) changed. Pure semantic-hash operations (kind:'tool').
  { name: 'sceneHash', arity: 1 },
  { name: 'timelineHash', arity: 1 },
  // 0.63 the CAPSTONE — assess(scene, timeline, opts?) is the ONE composed VERDICT
  // (validateScene + critique + exportFidelity + diff + certKey, unified/deduped/
  // prioritized + clean-of-fixable). recipe(name, props) instantiates a clean-by-
  // construction starter scaffold. Both are OPERATIONS returning a RESULT (a verdict
  // / a Group), not a problem list — kind:'tool', PERCEPTION-MANIFEST. The no-build
  // agent runs the author→assess→auto-fix-geometry→re-assess loop against these.
  { name: 'assess', arity: 2 },
  { name: 'recipe', arity: 2 },
];

/**
 * The opaque, type-ONLY names the API surface references (they erase at runtime —
 * `window.glissade.Paint` is `undefined`). `gs types --global` emits a best-effort
 * alias per name; `gs describe --lint` guards they stay type-only (a type surfaced
 * as a callable value is the ClipRegion-class drift this catches).
 */
const SURFACE_TYPE_ONLY = ['Paint', 'PathValue', 'FontAxes'];

/**
 * 0.63.1 — curated OPTIONS schemas for the opts-taking diagnostic/tool callables,
 * keyed by surface name and attached in {@link buildSurface}. The `opts` arg is
 * otherwise opaque on the manifest, so a no-build agent can't discover the knobs
 * (`minLegiblePx`/`exportBound`/…). Field names + types mirror `AssessOptions`
 * (extends `CritiqueOptions`) and `CritiqueOptions` exactly. Declared as a typed
 * map (NOT a `satisfies` over conditional spreads) so each literal keeps its field
 * types narrowed under `tsc --noEmit`.
 */
const SURFACE_OPTIONS: { [name: string]: SurfaceOption[] } = {
  assess: [
    {
      name: 'minLegiblePx',
      type: 'number',
      default: 6,
      summary:
        "legibility floor in px; the fontSize auto-fix won't shrink text below this — an overflow that can't fit at ≥ this size escalates instead of auto-shrinking",
    },
    {
      name: 'exportBound',
      type: 'boolean',
      default: false,
      summary: 'fold export-fidelity (RENDER_ONLY_EXPORT) diagnostics into the verdict',
    },
    {
      name: 'accepted',
      type: 'string[]',
      summary: "diagnostic codes / node ids / '<code>@<node>' to accept as known residual, removed from fixable",
    },
    {
      name: 'previous',
      type: 'SceneState',
      summary: 'prior {scene,timeline} — attaches a diff blast-radius',
    },
  ],
  critique: [
    {
      name: 'minLegiblePx',
      type: 'number',
      default: 6,
      summary:
        "legibility floor in px; the fontSize auto-fix won't shrink text below this — an overflow that can't fit at ≥ this size escalates instead of auto-shrinking",
    },
    {
      name: 'fps',
      type: 'number',
      summary: 'frame-sampling rate for the rendered pass',
    },
    {
      name: 'offstage',
      type: 'string[]',
      summary: 'node ids whose off-canvas is intentional — suppressed',
    },
  ],
};

/**
 * Assemble the {@link SurfaceEntry} taxonomy from the same curated registries the
 * rest of the manifest is built from (node factories + {@link HELPERS} + the core
 * callables), so it can't drift. Deterministic: deduped by name, sorted.
 */
function buildSurface(): SurfaceEntry[] {
  const out: SurfaceEntry[] = [];
  for (const name of SURFACE_CONSTRUCTORS) out.push({ name, kind: 'value', iife: true, form: 'constructor' });
  for (const h of HELPERS) {
    const arity = usageArity(h.usage);
    out.push({ name: h.name, kind: 'value', iife: true, form: 'function', ...(arity !== undefined ? { arity } : {}) });
  }
  for (const c of SURFACE_CORE) out.push({ name: c.name, kind: 'value', iife: true, form: 'function', arity: c.arity });
  for (const c of SURFACE_EXTRA) out.push({ name: c.name, kind: 'value', iife: true, form: 'function', arity: c.arity });
  for (const name of SURFACE_VALUE_OBJECTS) out.push({ name, kind: 'value', iife: true, form: 'object' });
  for (const d of SURFACE_DIAGNOSTICS) out.push({ name: d.name, kind: 'diagnostic', iife: true, form: 'function', arity: d.arity });
  for (const t of SURFACE_TOOLS) out.push({ name: t.name, kind: 'tool', iife: true, form: 'function', arity: t.arity });
  for (const name of SURFACE_TYPE_ONLY) out.push({ name, kind: 'type', iife: false, form: 'type' });
  const seen = new Set<string>();
  return out
    .filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      // 0.63.1: attach the curated options schema for opts-taking callables.
      const options = SURFACE_OPTIONS[e.name];
      return options ? { ...e, options } : e;
    });
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
/**
 * 0.59 F "manifest conventions" — the curated per-prop UNIT table (the
 * POSITION_ANCHOR precedent applied to units). Keyed by prop NAME; a prop absent
 * here carries no `unit` (unitless or px). Deliberately minimal: rotation is the
 * classic degrees-vs-radians ambiguity, Video's time offsets are seconds.
 */
const PROP_UNITS: { [prop: string]: string } = {
  rotation: 'degrees',
  at: 'seconds',
  trimStart: 'seconds',
  clipDuration: 'seconds',
  sourceFps: 'fps',
};

/**
 * 0.59 F/E — helpers that need a real text measurer for correct geometry (they
 * snapshot part/fit geometry through it). Surfaced as `requiresMeasurer:true`.
 */
const MEASURER_HELPERS = new Set<string>([
  'measureWrappedText',
  'splitText',
  'fitText',
  'fitTextSize',
  'fitTextGroup',
  'revealWords',
  'revealLines',
  'emphasizeWords',
]);

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
      ...(PROP_UNITS[path] !== undefined ? { unit: PROP_UNITS[path] } : {}),
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
      ...(PROP_UNITS[prop] !== undefined ? { unit: PROP_UNITS[prop] } : {}),
    };
  }
  return { props, positionAnchor: POSITION_ANCHOR[typeName] ?? 'center', bindable: bindableProps(props) };
}

/** The animatable (Track-drivable) prop names of a manifest — the generated
 *  0.59 `DescribedNode.bindable` discovery aid (can't drift from `props`). */
function bindableProps(props: { [prop: string]: DescribedProp }): string[] {
  return Object.entries(props)
    .filter(([, p]) => p.animatable)
    .map(([name]) => name);
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
  return { props, positionAnchor: 'top-left', bindable: bindableProps(props), subpath: LAYOUT_SUBPATH };
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
      "createPlayer({ playhead: createPlayhead(), duration: 2 }, { loop?: boolean }): Player  —  player.play() → { finished }, player.pause(), player.seek(t: seconds), player.rate = 2, player.onMarker(name, cb), player.onCue(kind, cb)",
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
    name: 'camera',
    summary:
      "A cinematic camera rig (FACTORY, no `new`): a Group subclass that applies the inverse camera pose as a parent transform over layered content — push-ins, pans, rolls, and pan-only parallax by layer depth. The pose (center/zoom/roll) are keyframeable track targets; the world moves while nodes stay node-local (no double-apply with anchors). Captions belong as SIBLINGS of the camera (outside the rig) so they stay pinned. Tree-shakeable (@glissade/scene/motion).",
    import: '@glissade/scene/motion',
    usage:
      "camera(layers: { content: Node, depth? }[], props?: { id?, center?, zoom?, roll?, shake? }): Camera  —  center is RELATIVE viewport coords ([0.5,0.5]=center, never px); animate 'cam/center(.x/.y)', 'cam/zoom', 'cam/roll'. depth<1 = far (parallax pans less).",
  },
  {
    name: 'shake',
    summary:
      'A standalone jitter driver (mutate-and-return, like orientToPath): wobbles ANY node’s pose with deterministic value noise, folded in at emit as a parent-space offset so it composes with whatever else drives the node. SEPARATE translate (px) / rotate (deg) / frequency (Hz) amplitudes; pure and byte-identical run-to-run (seeded, no Date/Math.random). Tree-shakeable (@glissade/scene/motion).',
    import: '@glissade/scene/motion',
    usage: 'shake(node: Node, opts: { seed: number, translate?: number, rotate?: number, frequency?: number }): Node',
  },
  {
    name: 'particles',
    summary:
      "A small SEEDED, BAKED particle emitter (FACTORY, no `new`): composes each() (count fixed slot nodes at `${id}/${i}`) + bake() (seeded physics → position/opacity/scale/rotation tracks on those SAME ids). Every slot is a real node with real tracks → a real exportable Lottie layer, faithful BY CONSTRUCTION (no render-only/custom-draw path). `count` is the MAX-CONCURRENT ring-buffer pool (bounded 200 — over THROWS, never clamps), NOT total emitted; opacity-0-for-the-whole-window slots are pruned so the layer count stays proportional. Seed defaults to hashStr(id); byte-identical run-to-run, a different seed varies. ESCAPE HATCH: `appearance` (any Node/glyph template), `step` (raw per-particle sim), `...` velocity/forces/lifetime. Tree-shakeable (@glissade/scene/motion).",
    import: '@glissade/scene/motion',
    usage:
      "particles(spec: { id, count, box: {w,h}, duration, fps, origin: [fx,fy], lifetime: number | [min,max], velocity: { speed:[min,max], angle:[min,max] (deg) }, appearance: (i, ctx) => Node | { node, opacityOverLife?, scaleOverLife? }, rate?, burst?: number | {at,n}[], seed?, area?, safeBottom? (relative [0,1] safe-area clamp — no spawn below this Y), forces?: { gravity?, drag?, wind? }, spin?, opacityOverLife?, scaleOverLife?, step?: (p, dt, rng) => void }): { node: Group, tracks: Track[], end }  —  supply rate and/or burst; count > 200 throws; safeBottom out-of-[0,1] or above the spawn-band top throws.",
  },
  {
    name: 'drift',
    summary:
      "Particles preset: ambient low-opacity motes floating gently up (a bokeh companion). Continuous low-rate; DEFAULTS to a small max-concurrent count (24) so the exported layer count stays proportional, NOT 200 near-empty layers. SAFE-AREA (0.57.1): the DEFAULT spawn band is centered + shallow (bottom ~0.68H) so bare drift() clears a standard lower-third caption safe-area by itself; pass `safeBottom` (relative [0,1]) to pin a consumer's exact captionTop, or override `area`/`origin` for a custom spawn region. `appearance` is the primary control (a themed dot); `...rest` forwards to particles() (velocity/forces/lifetime/area/safeBottom/step). Factory (no `new`). Tree-shakeable (@glissade/scene/motion).",
    import: '@glissade/scene/motion',
    usage:
      "drift(opts: { box: {w,h}, duration, fps, count?, rate?, origin?, color?, radius?, seed?, id?, area?, safeBottom? (relative [0,1] — no motes below this Y, e.g. just above captionTop), ...rest (lifetime/velocity/forces/appearance/step) }): { node: Group, tracks: Track[], end }",
  },
  {
    name: 'sparks',
    summary:
      'Particles preset: a subtle corporate-safe radial impact burst (win-beat / habit-stamp flourish) — short-life dots thrown outward from origin, shrinking + fading with a touch of gravity. LOW density by default. `...rest` forwards to particles() (the escape-hatch appearance/step/velocity). Factory (no `new`). Tree-shakeable (@glissade/scene/motion).',
    import: '@glissade/scene/motion',
    usage:
      "sparks(origin: [fx,fy], opts: { box: {w,h}, duration, fps, count?, at?, color?, radius?, seed?, id?, ...rest (lifetime/velocity/forces/appearance/step) }): { node: Group, tracks: Track[], end }",
  },
  {
    name: 'dispense',
    summary:
      "Particles preset: a DIRECTIONAL sparks variant — a small themed sparkle emanating one way at a beat (the vending \"AS ASKED\" flourish ON the drop, not a stream). Directional angle bias + an optional GLYPH node-template. `...rest` forwards to particles(). Factory (no `new`). Tree-shakeable (@glissade/scene/motion).",
    import: '@glissade/scene/motion',
    usage:
      "dispense(origin: [fx,fy], opts: { box: {w,h}, duration, fps, angle?, spread?, glyph?, glyphSize?, glyphFamily?, count?, at?, color?, seed?, id?, ...rest (appearance/step/velocity/forces) }): { node: Group, tracks: Track[], end }",
  },
  {
    name: 'valueNoise',
    summary:
      'Closed-form smooth value noise: a PURE function of (seed, t) — lerp(rand(⌊t⌋), rand(⌊t⌋+1), smoothstep(fract t)) with core’s seeded hash. No state, no bake; deterministic by construction (byte-identical run-to-run), fps-independent, O(1), seekable — the closed-form sibling of a spring. Range [0,1); center a signed wobble with *2-1. The primitive behind shake + camera shake.',
    import: '@glissade/core',
    usage: 'valueNoise(seed: number, t: number): number  //  jitterX = () => 3 * (valueNoise(7, t) * 2 - 1)',
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
    name: 'typeOn',
    summary:
      "Kinetic type: one-call typewriter over the shipped typewriter(). DEFAULT emits a STRING hold-key track on `<id>/text` (round-trips to Lottie as stepped text docs). { cursor: true } adds a render-only caret sibling (export warns+drops it); { mask: true } swaps to a render-only `<id>/reveal` grapheme mask (export warns 'reveal not exported'). Factory (no `new`). Inject with tl.tracks([r.track]); draw r.node (+ r.cursor). On @glissade/scene/type.",
    import: '@glissade/scene/type',
    usage:
      "typeOn(source: Text | TextProps, opts?: { perChar?, start?, cursor?: boolean, mask?: boolean, cursorWidth?, blinkPeriod?, cursorFill?, cursorProps? }): { node: Text, cursor?: TextCursor, track: Track, marks, duration } — cursorFill sets a contrasting caret color (default follows text fill); cursorProps forwards any other TextCursor prop",
  },
  {
    name: 'revealWords',
    summary:
      'Kinetic type: splitText(by:\'word\') → cascade each word in (opacity, optionally rising from \'below\'/dropping from \'above\', or \'fade\'). Returns the split Group as `node` (draw THIS, not the source) plus REAL tracks that round-trip to Lottie. Factory (no `new`). Pass { measurer } for exact geometry. On @glissade/scene/type.',
    import: '@glissade/scene/type',
    usage:
      "revealWords(source: Text | TextProps, opts?: { each?, from?: 'below'|'above'|'fade', distance?, duration?, ease?, at?, id?, measurer? }): { node: Group, tracks: Track[] }",
  },
  {
    name: 'revealLines',
    summary:
      'Kinetic type: like revealWords but splitText(by:\'line\') — cascade each LINE in. Returns the split Group as `node` + REAL tracks (round-trip to Lottie). Factory (no `new`). On @glissade/scene/type.',
    import: '@glissade/scene/type',
    usage:
      "revealLines(source: Text | TextProps, opts?: { each?, from?: 'below'|'above'|'fade', distance?, duration?, ease?, at?, id?, measurer? }): { node: Group, tracks: Track[] }",
  },
  {
    name: 'emphasizeWords',
    summary:
      'Kinetic type: pulse (scale up-and-back) the words at `indices` in reading order, cascaded. FAIL-LOUD: an out-of-range or non-integer index THROWS. Real scale tracks (round-trip to Lottie). Returns the split Group as `node`. Factory (no `new`). On @glissade/scene/type.',
    import: '@glissade/scene/type',
    usage:
      "emphasizeWords(source: Text | TextProps, indices: number[], opts?: { scale?, duration?, each?, ease?, at?, by?: 'word'|'grapheme', id?, measurer? }): { node: Group, tracks: Track[] }",
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
    name: 'exprTrack',
    summary:
      'Expr (0.40): drive a numeric prop by a FORMULA of the playhead t instead of keyframes — exprTrack("orb/position.y", "200 + 80*sin(t*2)"), fed via tl.tracks(...). Pure function of t: constants (PI/TAU/E), a math whitelist (sin/cos/clamp/lerp/smoothstep/min/max/mod/floor/…), and seeded rand(x) — no Date/Math.random. Compile-validated, byte-identical determinism to keyframes. On the tree-shakeable @glissade/core/expr subpath (off the base embed).',
    import: '@glissade/core/expr',
    usage: 'exprTrack(target: string, formula: string): Track  //  tl.tracks([exprTrack("orb/opacity", "0.5 + 0.5*cos(t)")])',
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

/**
 * The registered starter-recipe registry, surfaced by `describe().recipes`.
 * Populated by `@glissade/scene/recipes` on import via {@link registerRecipes} — a
 * registration hook (NOT a static import) so describe() (and the base index / IIFE)
 * never pay for the recipe factories unless the subpath is loaded. Empty until then.
 */
let recipeRegistry: readonly DescribedRecipe[] = [];

/**
 * Register the starter-recipe manifest — called by `@glissade/scene/recipes` on
 * import. A registration hook (not a static import) so `describe()` stays lean.
 */
export function registerRecipes(recipes: readonly DescribedRecipe[]): void {
  recipeRegistry = recipes;
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
    // 0.59 F: stamp requiresMeasurer:true on the measurer-dependent helpers
    // (curated set, generated onto the entries so it can't drift), plus examples
    // when requested. A helper with neither is byte-identical to its literal.
    helpers: HELPERS.map((h) => ({
      ...h,
      ...(MEASURER_HELPERS.has(h.name) ? { requiresMeasurer: true } : {}),
      ...(withEx ? ex(h.name) : undefined),
    })),
    // 0.36: user-defined components from the live registry (empty by default)
    components: listComponents().map((c) => ({ name: c.name, props: mapComponentProps(c.props) })),
    // 0.63: starter-scaffold recipes from the live registry (empty until the
    // @glissade/scene/recipes subpath is imported — the examples-corpus pattern).
    recipes: recipeRegistry.map((r) => ({ ...r })),
    // The full construct-a-scene surface: the size + children AND the asset
    // manifest (so Image/Video `assetId` resolves to a real media URL). An
    // `assetId` on a node names an entry in this `assets` map.
    createScene:
      "createScene({ size: { w, h }, children: Node[] }): Scene  —  media assets are declared on the Timeline document: timeline({ assets: { <id>: { kind: 'image'|'video', url } } }); an Image/Video node's `assetId` names an entry here.",
    subpaths: SUBPATHS,
    // 0.47: the window.glissade runtime SURFACE taxonomy (drift guard + ambient .d.ts).
    surface: buildSurface(),
    // 0.63.1: prose-guide pointers so a no-build agent discovers the authoring loop
    // from the manifest, not by hunting the docs site.
    guides: [
      {
        name: 'authoring-loop',
        summary:
          'author→assess→auto-fix-geometry→re-assess→clean; the meaning-veto escalates content-only diagnostics to a human',
        href: '/authoring-loop.html',
      },
    ],
  };
}

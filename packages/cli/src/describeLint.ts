/**
 * `gs describe --lint` (0.47 "verifiable ground-truth") — the describe()↔bundle
 * drift guard, factored PURE.
 *
 * describe() curates the node/helper/surface taxonomy by hand for the members that
 * live ABOVE `scene` in the dep graph (player/backend factories scene can't import).
 * That curation can silently drift from what actually ships on `window.glissade`
 * (three historical drifts: `fitTextSize` missing, `ClipRegion` surfaced as a value,
 * `defineComponent` shorthand). This lint reconciles the manifest against the REAL
 * runtime surface and fails loud on any gap — the same cross-check
 * `@glissade/browser`'s smoke test seeded (iterate describe().helpers, assert each
 * resolves), generalized to the whole surface and wired as a CI gate.
 *
 * PURE: `(manifest, runtimeSurface) => violations[]`. The caller injects the
 * surface — the `check:describe` CI gate injects the built `@glissade/browser`
 * bundle (the authoritative IIFE surface); `gs describe --lint` injects the
 * headless surface it can assemble ({@link collectRuntimeSurface}) and exempts the
 * few browser-only helpers a Node CLI can't import.
 */

import type { ApiManifest } from '@glissade/scene/describe';
import { usageArity } from '@glissade/scene/describe';

export type LintKind = 'missing' | 'not-callable' | 'type-as-value' | 'arity' | 'unsurfaced';

export interface LintViolation {
  /** Which invariant broke. */
  readonly kind: LintKind;
  /** The offending export name. */
  readonly name: string;
  /** One line: what's wrong + how to fix it. */
  readonly detail: string;
}

export interface LintOptions {
  /**
   * Names the caller could NOT load in this runtime (e.g. browser-only helpers a
   * headless Node CLI can't import) — reported as skipped, never a violation. The
   * `check:describe` CI gate (which loads the whole `@glissade/browser` bundle)
   * passes none, so it covers these.
   */
  readonly exempt?: ReadonlySet<string>;
}

/**
 * Type-only surface names that ARE legitimately a runtime class/value on the
 * bundle (a driver class exported under the same name as its type). Empty today —
 * the current type-only surface (Paint/PathValue/FontAxes) erases entirely — but a
 * seam so a future `FollowPath`-style class-and-type name doesn't false-positive.
 */
const RUNTIME_TYPE_ALLOWLIST = new Set<string>([]);

/**
 * PUBLIC runtime exports that are intentionally NOT authoring surface, so they need
 * not appear in describe().surface — the curated exempt-list that makes the
 * BIDIRECTIONAL "no-MISSING" gate precise. Grouped by rationale. A NEW public export
 * that fits none of these (nor a pattern below) must be added to describe()'s surface
 * (authoring) OR here (internal), or `check:describe` fails — which is exactly how an
 * omission (a real authoring export absent from surface, red-lining valid no-build
 * code under the ambient .d.ts) is now caught instead of staying silently green.
 */
const EXEMPT_INTERNALS = new Set<string>([
  // Helper RETURN classes + base/advanced node classes + backends + the custom element.
  // Authors call the helper/constructor, not these; the node CONSTRUCTORS in surface
  // (Group…Layout) are the authoring entry, these are their return/instance types.
  'Camera', 'Canvas2DBackend', 'Custom', 'Echo', 'FollowPath', 'GsPlayerElement', 'Highlight', 'ImageNode', 'LookAt', 'MotionBlur', 'Node', 'OrientToPath', 'Raster2D', 'ShaderEffect', 'TextCursor', 'TrackMatte',
  // Constants / registries / sentinels (not callable authoring entry points).
  'ALL_FILTER_KINDS', 'DEFAULT_EASE', 'EXPR_CONSTANTS', 'EXPR_FUNCTIONS', 'IDENTITY', 'MAX_PARTICLE_COUNT', 'MEASURE_QUANTUM_PX', 'MESH_DOWNSCALE', 'MESH_SHEPARD_POWER', 'MESH_SIGMA', 'NODE_TAXONOMY', 'TARGET_PATH', 'easingDerivatives', 'estimatingMeasurer', 'springPresets',
  // Backend / element / player / driver / scheduler / layout-engine / measurer plumbing
  // (embed wiring done by mount()/the CLI, never hand-called by a no-build author).
  'clockDriver', 'scrollDriver', 'createPlayhead', 'createDisplayListBuilder', 'getLayoutEngine', 'setLayoutEngine', 'requireLayoutEngine', 'loadYogaLayoutEngine', 'swapOnHmr', 'setScheduler', 'synchronousScheduler', 'setDefaultMeasurer', 'setDevWarning', 'defineGsPlayer', 'buildFontRegistry', 'setShaderRunner',
  // Compile / bind / bake / evaluate / read-phase pipeline + registries/validators
  // (build internals; `listComponents` is describe()'s own registry reader, not on the IIFE).
  'bake', 'bakeCheckpointed', 'batch', 'beginReadPhase', 'endReadPhase', 'inReadPhase', 'bindScene', 'bindTimeline', 'buildTimeline', 'compileExpr', 'compileTimeline', 'computed', 'collapseReplacer', 'evaluateAt', 'getTimelineCallbacks', 'sampleTrack', 'validateTrack', 'withDeterminismGuards', 'untracked', 'revealSchedule', 'registerExamples', 'listComponents', 'isDurationEditable', 'isEditableNodeId', 'targetNodeId', 'resolveTweenTarget', 'drawOn', 'drawOnEach',
  // Low-level geometry / color / math / text / mesh / font / sketch helpers + validators
  // + niche re-exports (advanced; not the MVP no-build authoring surface). NB
  // driftLoop / each / random / pathFromSegs / parseSvgPathData / pointAtLength /
  // pathLength are candidates to PROMOTE to surface if canaries request — exempt for
  // now, not principled internals.
  '__resetEstimateWarnings', 'applyToPoint', 'arcLength', 'assertFiniteFontSize', 'shakeOffset', 'shakenSpec', 'cameraLayerMatrix', 'audioOffsetSamples', 'breakLines', 'childId', 'coercePathData', 'cubicBezierDerivative', 'driftLoop', 'each', 'emitDevWarning', 'filtersToCanvasFilter', 'flatten', 'fontString', 'formatColor', 'fromTRS', 'hachureLines', 'invert', 'isEstimatingMeasurer', 'isExemptFamily', 'lerpColor', 'listValueTypes', 'matEquals', 'mediaPrefersReducedMotion', 'meshRasterSize', 'multiply', 'oklabToRgba', 'parseCmap', 'parseColor', 'parseSvgPathData', 'pathFromSegs', 'pathLength', 'planReducedMotion', 'pointAtLength', 'quantize', 'random', 'rasterizeMesh', 'reprOf', 'resolveAnchor', 'resolveEase', 'resolveEaseDerivative', 'resolveSketch', 'rgbaToOklab', 'roughen', 'roundedRectSegs', 'segmentGraphemes', 'segmentWords', 'sketchStrokes', 'springEasing', 'springEasingDerivative', 'textCursor', 'transitionToClip', 'usageArity', 'validateFilters', 'validateFonts', 'validateHachure', 'validateSketch', 'vec2Equals', 'vec2Signal', 'velocityAt',
  // 0.59 "fail-loud ground floor" authoring diagnostics (re-exported onto the
  // browser IIFE off the @glissade/scene/diagnostics subpath): the eager validator
  // + the truthful read primitive + the instance bound indicator + the schema
  // version constant. DEV/authoring diagnostic tooling (the same class as the
  // diff/audit/fontUsage cluster on that subpath — not core authoring
  // "fundamentals"), so they are exempt-internal rather than describe().surface
  // entries. MeasurerRequiredError is pattern-exempt via /Error$/.
  'validateScene', 'resolveAt', 'instanceProps', 'DIAGNOSTIC_SCHEMA_VERSION',
]);

/**
 * PATTERN-exempt runtime exports (no per-name entry needed): error classes
 * (`…Error`), the value-type registry + its accessors (`…Type`), and the ESM
 * `default` binding. Everything else must be surfaced or in {@link EXEMPT_INTERNALS}.
 */
function isExemptPattern(name: string): boolean {
  return name === 'default' || /Error$/.test(name) || /Type$/.test(name);
}

/** Whether a public runtime export is intentionally NOT part of describe().surface. */
export function isExemptFromSurface(name: string): boolean {
  return isExemptPattern(name) || EXEMPT_INTERNALS.has(name);
}

/**
 * The set of public runtime exports on `surface` that are NEITHER surfaced by the
 * manifest NOR exempt — i.e. the omissions the bidirectional gate flags. Exposed so
 * a canary/edcc guard can assert `unsurfacedExports(describe(), browser)` is empty.
 */
export function unsurfacedExports(manifest: ApiManifest, surface: Record<string, unknown>): string[] {
  const surfaced = surfacedNames(manifest);
  return Object.keys(surface)
    .filter((name) => !surfaced.has(name) && !isExemptFromSurface(name))
    .sort();
}

/** Every name the manifest presents as authoring surface (surface entries + node/helper names). */
function surfacedNames(manifest: ApiManifest): Set<string> {
  const surfaced = new Set<string>();
  for (const e of manifest.surface ?? []) surfaced.add(e.name);
  for (const n of Object.keys(manifest.nodes)) surfaced.add(n);
  for (const h of manifest.helpers) surfaced.add(h.name);
  return surfaced;
}

/**
 * Reconcile a describe() manifest against a runtime surface record. Returns every
 * violation (empty = clean); the CLI prints them and exits non-zero.
 *
 * Assertions:
 *  (a) every callable the manifest advertises (node constructor, helper, surface
 *      value function/constructor) resolves to a `function` on the bundle;
 *  (b) every surface `kind:'type'` name is truly type-only (erases at runtime) —
 *      a type surfaced as a runtime value is the drift this catches;
 *  (c) arity: a documented callable must not REQUIRE materially more positional
 *      args than its usage advertises (`Function.length > documented total + 1`;
 *      tolerant by one — a trailing optional like `measurer` legitimately lifts
 *      `Function.length`);
 *  (d) NO-MISSING (the BIDIRECTIONAL half): every PUBLIC runtime export on the
 *      bundle must be SURFACED or explicitly exempt ({@link isExemptFromSurface}) —
 *      an omission (a real authoring export absent from surface, which red-lines
 *      valid no-build code under the ambient .d.ts) fails here. Without (d) the gate
 *      could only catch PHANTOMS, never OMISSIONS — the class it was scoped to gate.
 */
export function describeLint(
  manifest: ApiManifest,
  surface: Record<string, unknown>,
  opts: LintOptions = {},
): LintViolation[] {
  const exempt = opts.exempt ?? new Set<string>();
  const out: LintViolation[] = [];
  const isFn = (n: string): boolean => typeof surface[n] === 'function';
  const present = (n: string): boolean => surface[n] !== undefined;

  // (a) callable resolution — nodes + helpers + surface value functions/constructors.
  const callables = new Set<string>();
  for (const name of Object.keys(manifest.nodes)) callables.add(name);
  for (const h of manifest.helpers) callables.add(h.name);
  for (const e of manifest.surface ?? []) {
    if (e.kind === 'value' && (e.form === 'constructor' || e.form === 'function')) callables.add(e.name);
  }
  for (const name of [...callables].sort()) {
    if (exempt.has(name) || isFn(name)) continue;
    out.push(
      present(name)
        ? { kind: 'not-callable', name, detail: `window.glissade.${name} is a ${typeof surface[name]}, expected a function` }
        : { kind: 'missing', name, detail: `window.glissade.${name} is documented but MISSING from the runtime bundle` },
    );
  }

  // value OBJECTS (form 'object', e.g. easings): must be present, need not be callable.
  for (const e of manifest.surface ?? []) {
    if (e.kind === 'value' && e.form === 'object' && !exempt.has(e.name) && !present(e.name)) {
      out.push({ kind: 'missing', name: e.name, detail: `window.glissade.${e.name} (value export) is MISSING from the runtime bundle` });
    }
  }

  // (b) type-only names must stay type-only (erase at runtime).
  for (const e of manifest.surface ?? []) {
    if (e.kind === 'type' && !exempt.has(e.name) && present(e.name) && !RUNTIME_TYPE_ALLOWLIST.has(e.name)) {
      out.push({
        kind: 'type-as-value',
        name: e.name,
        detail: `'${e.name}' is tagged kind:'type' but resolves to a runtime ${typeof surface[e.name]} — surface it as kind:'value' or remove it`,
      });
    }
  }

  // (c) arity drift.
  for (const h of manifest.helpers) {
    if (exempt.has(h.name)) continue;
    const fn = surface[h.name];
    if (typeof fn !== 'function') continue; // (a) already flagged it
    const total = usageArity(h.usage);
    if (total !== undefined && fn.length > total + 1) {
      out.push({
        kind: 'arity',
        name: h.name,
        detail: `window.glissade.${h.name} takes ${fn.length} params but its usage documents ${total} — update describe()'s usage or the signature`,
      });
    }
  }

  // (d) NO-MISSING — every public runtime export must be surfaced or exempt.
  const surfaced = surfacedNames(manifest);
  for (const name of Object.keys(surface).sort()) {
    if (surfaced.has(name) || exempt.has(name) || isExemptFromSurface(name)) continue;
    out.push({
      kind: 'unsurfaced',
      name,
      detail: `on window.glissade but absent from describe().surface — add it to buildSurface() (an authoring export) or the exempt-list in describeLint.ts (an internal)`,
    });
  }

  return out;
}

/**
 * Assemble the runtime surface a HEADLESS `gs describe --lint` can reach: the
 * embed authoring packages the CLI legitimately depends on (core + scene + their
 * tree-shakeable subpaths + player), merged into one record. Browser-only modules
 * (`@glissade/backend-canvas2d/snapshot`, `@glissade/element`) are NOT CLI deps —
 * importing them throws, so those specifiers are collected into `unreachable` and
 * the caller exempts the helpers they'd have provided. (The `check:describe` CI
 * gate injects the built `@glissade/browser` bundle instead, so it verifies those
 * too.)
 */
export async function collectRuntimeSurface(
  manifest: ApiManifest,
): Promise<{ surface: Record<string, unknown>; unreachable: Set<string> }> {
  const modules = new Set<string>([
    '@glissade/core',
    '@glissade/core/clips', // popIn/slideIn/pulse/presence/morph (surface EXTRA)
    '@glissade/scene',
    '@glissade/scene/describe',
    '@glissade/scene/layout-ctors',
    '@glissade/scene/path', // pathFromSvg (surface EXTRA)
  ]);
  for (const h of manifest.helpers) modules.add(h.import);
  const surface: Record<string, unknown> = {};
  const unreachable = new Set<string>();
  for (const spec of modules) {
    try {
      Object.assign(surface, await import(spec));
    } catch {
      unreachable.add(spec);
    }
  }
  return { surface, unreachable };
}

/** The exempt name-set for a headless lint: helper names whose import module was unreachable. */
export function exemptFromUnreachable(manifest: ApiManifest, unreachable: ReadonlySet<string>): Set<string> {
  const exempt = new Set<string>();
  for (const h of manifest.helpers) if (unreachable.has(h.import)) exempt.add(h.name);
  return exempt;
}

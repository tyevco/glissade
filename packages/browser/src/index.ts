// @glissade/browser — the combined realtime browser embed surface (DESIGN.md §4.4).
//
// Re-exports the full embed path (core + scene + player + canvas2d + element)
// from one entry. The tsdown build emits the npm-ESM `dist/index.js`;
// `scripts/build-browser.mjs` then bundles that ESM into a single minified IIFE
// (`dist/glissade.browser.js`) exposing `window.glissade.*` for <script src> /
// no-build use.
//
// `core`, `scene`, and `player` have no public-name collisions (the same as the
// `glissade` umbrella — `Paint`/`ColorStop` resolve to the same core symbol that
// scene merely re-exports). `backend-canvas2d` is re-exported by NAME (only its
// two embed-relevant value exports, `Canvas2DBackend` + `setShaderRunner`) so a
// `export *` can't drag in its internal type surface or collide. `element` is
// imported for its side effect — its module load calls
// `customElements.define('gs-player', …)`, so the bundle auto-registers
// `<gs-player>` — and re-exported for `GsPlayerElement` / `defineGsPlayer`.

export * from '@glissade/core';
// The clip tier (presence/each/morph/clip/clipList + the stdlib) lives on the
// `@glissade/core/clips` subpath — tree-shaken off the base index for the core
// budget. The single-file convenience bundle SHOULD expose the whole authoring
// surface, so re-export it here (NOT from the core base index, which would pull
// it into the core/index size budget).
export * from '@glissade/core/clips';
// Expr (0.40): the formula evaluator + exprTrack live on `@glissade/core/expr`
// (off the base embed). The convenience bundle exposes the whole authoring surface,
// so re-export it here — this also registers the compiler seam, so a no-build
// author's `window.glissade.exprTrack('x/y', 'sin(t)')` just works.
export { exprTrack, compileExpr, ExprError, EXPR_FUNCTIONS, EXPR_CONSTANTS, type CompiledExpr } from '@glissade/core/expr';
export * from '@glissade/scene';
// The SVG `d`-string parser lives on the tree-shaken `@glissade/scene/path`
// subpath (off the base scene index for the scene budget). The single-file
// convenience bundle SHOULD expose it, so re-export it here — `pathFromSvg` +
// `parseSvgPathData` land on `window.glissade` for `new Path({ data:
// G.pathFromSvg('M0 0 …') })`.
export * from '@glissade/scene/path';
// `splitText` (0.19 kinetic typography) lives on the tree-shaken
// `@glissade/scene/type` subpath (off the base scene index for the scene
// budget). The no-build consumer that REQUESTED it (explainer-video kinetic
// typography) works only against this IIFE, so it must reach window.glissade —
// `G.splitText(props, { by:'word', measurer: backend })`. +0.44 kB, within the
// browser budget.
export { splitText } from '@glissade/scene/type';
// 0.35 fitText (shrink-to-fit + wrap-to-max-lines) — same /type subpath, same
// measurer plumbing as splitText; a no-build author reaches for window.glissade.fitText.
export { fitText, fitTextSize, fitTextGroup, type FitTextOpts } from '@glissade/scene/type';
// caption-split: splitToFit — the measured band-aware splitter (per-locale
// sentence→clause→word). TextFitError instanceof-catchable off the IIFE; a no-build
// author reaches window.glissade.splitToFit / window.glissade.TextFitError.
export { splitToFit, TextFitError, type SplitToFitOpts } from '@glissade/scene/type';
// MeasurerRequiredError — the measurer-fail-loud error EVERY text-geometry getter
// (splitText/fitText/measuredSize/wordBoxes/…) THROWS BY DEFAULT when no real
// measurer is available, unless `{ estimate: true }` opts into the rough estimate.
// Every other fail-loud error class (UnboundTargetError/ParticleError/
// KineticTypeError) is on window.glissade so a no-build author can `catch (e) { if
// (e instanceof …) }`; this one lived only on the /type subpath, so it wasn't
// instanceof-catchable off the IIFE. Re-export it here (type-error class, ~0 bytes).
export { MeasurerRequiredError } from '@glissade/scene/type';
// 0.56 kinetic type presets — one-call sugar over typewriter/splitText/tl.stagger,
// same /type subpath. The no-build kinetic-typography author reaches for
// window.glissade.typeOn / revealWords / revealLines / emphasizeWords.
export {
  typeOn,
  revealWords,
  revealLines,
  emphasizeWords,
  KineticTypeError,
  type TypeOnOpts,
  type TypeOnResult,
  type RevealOpts,
  type RevealResult,
  type RevealFrom,
  type EmphasizeOpts,
} from '@glissade/scene/type';
// 0.20 no-build layout split: the Yoga-FREE node ctors (Layout/Stack/Row/Column)
// live on `@glissade/scene/layout-ctors` — they touch the LayoutEngine seam only
// at compute time, never `import('yoga-layout/load')` at construction. So they
// ride the IIFE cleanly (the loader, which inlines Yoga's wasm under esbuild's
// IIFE format, does NOT). The no-build consumer must call
// `await glissade.loadYogaLayoutEngine()` ONCE before evaluating a Layout scene,
// else the first compute throws LayoutEngineMissingError. Yoga is NOT inlined —
// `loadYogaLayoutEngine` keeps its dynamic `import('yoga-layout/load')` as a
// RUNTIME import (scripts/build-browser.mjs externalizes `yoga-layout/load`).
// (setLayoutEngine/getLayoutEngine already reach window.glissade via the seam on
// `export * from '@glissade/scene'`; only the loader is new here.)
export { Layout, Stack, Row, Column } from '@glissade/scene/layout-ctors';
export { loadYogaLayoutEngine } from '@glissade/scene/layout';
// 0.20 Grid (Fork B: scene-side track resolver) — a build-time fan-out (like
// each()/splitText), NOT a Yoga feature. Lives on the tree-shakeable
// `@glissade/scene/grid` subpath, off the base embed. Re-exported here so
// `window.glissade.Grid` survives for the no-build consumer.
export { Grid } from '@glissade/scene/grid';
// 0.32 Chart (the data-motion stack): a build-time fan-out (like Grid) on the
// tree-shakeable `@glissade/scene/chart` subpath, off the base embed. The no-build
// data-viz author reaches for `window.glissade.Chart` + the scale factories, so
// the convenience bundle re-exports them here (same rationale as Grid/splitText).
export { Chart, linearScale, logScale, bandScale, colorRamp } from '@glissade/scene/chart';
// 0.38 Gauge/Meter (radial data-viz) — a build-time fan-out on the tree-shakeable
// `@glissade/scene/gauge` subpath, off the base embed. The no-build data-viz author
// reaches for `window.glissade.Gauge`/`Meter` (value→needle or authored angle).
export { Gauge, Meter, GaugeError, type GaugeSpec, type GaugeZone, type GaugeResult } from '@glissade/scene/gauge';
// 0.36 defineComponent (reusable typed subscenes) — a build-time factory like Grid/
// Chart on the tree-shakeable /component subpath; the no-build author reaches for
// window.glissade.defineComponent to build a component library.
export { defineComponent, childId, ComponentError, type ComponentDef, type ComponentInstance, type ComponentPropSpec } from '@glissade/scene/component';
// `motionPath` / `followPath` (the §3 motion-path follow helper) moved to the
// tree-shakeable `@glissade/scene/motion` subpath in the 0.20 budget review (off
// the base scene index, off the base-embed budget). It is a USER-FACING helper
// the no-build design agent reaches for as `window.glissade.motionPath`, so the
// single-file convenience bundle MUST re-export it here so it lands on
// window.glissade — mirroring pathFromSvg / splitText.
export { followPath, motionPath, pointAtLength, pathLength, FollowPath } from '@glissade/scene/motion';
// 0.26 orientation drivers (rotation-only siblings of followPath): the no-build
// design agent reaches for `window.glissade.orientToPath` / `.lookAt`, so the
// convenience bundle re-exports them here too (same rationale as followPath).
export { orientToPath, lookAt, OrientToPath, LookAt } from '@glissade/scene/motion';
// 0.55 Camera rig + shake driver (cinematic camera moves + deterministic pose
// jitter): the no-build design agent reaches for window.glissade.camera / .shake,
// so the convenience bundle re-exports them here (same rationale as followPath).
export { Camera, camera, CameraError, shake, shakeOffset } from '@glissade/scene/motion';
// 0.57 Particles/Emitters: the no-build design agent reaches for
// window.glissade.particles / .drift / .sparks / .dispense, so the convenience
// bundle re-exports the emitter + presets here (same rationale as camera/shake).
export { particles, drift, sparks, dispense, ParticleError } from '@glissade/scene/motion';

// 0.71 kenBurns (per-node photo pan/zoom preset) is on @glissade/scene/motion; the
// no-build author reaches for window.glissade.kenBurns, so re-export it here too
// (same rationale as camera/particles).
export { kenBurns, KenBurnsError } from '@glissade/scene/motion';
// `tokenHighlight` (the PRODUCTION token-highlight render component — visible
// sub-line token tell-tags) lives on the tree-shakeable `@glissade/scene/tokens`
// subpath (off the base scene index for the scene budget; the ai-training finding
// split it OUT of /diagnostics so visible-UI rendering no longer reads as a debug
// import). It is a USER-FACING render component, so it WOULD be a natural
// window.glissade.* citizen alongside splitText / Grid / motionPath — but
// re-exporting it here measured +1.16 kB gz (47.47 → 48.63), busting the 48 kB
// IIFE ceiling. So tokenHighlight is npm-subpath-only (`@glissade/scene/tokens`)
// and is NOT on the convenience bundle; a no-build author reaches it via an npm
// import. (If the IIFE budget is later raised, this is the place to add it.)
// The machine-readable API manifest (0.18) lives on the tree-shakeable
// `@glissade/scene/describe` subpath (off the base scene index). The single-file
// convenience bundle SHOULD expose it for discoverability, so re-export it here —
// `glissade.describe()` lands on `window.glissade`, and the build writes its
// JSON.stringify(describe()) to dist/glissade.api.json.
export * from '@glissade/scene/describe';
// 0.59 "fail-loud ground floor" authoring diagnostics: the eager scene validator
// (validateScene), the truthful read primitive (resolveAt), the instance-level
// bound indicator (instanceProps), and the pinned diagnostic SCHEMA surface
// (DIAGNOSTIC_SCHEMA_VERSION + the code/severity/result types). These live on the
// tree-shakeable `@glissade/scene/diagnostics` subpath, off the SACRED base embed
// — the no-build author works ONLY against this IIFE, so an author-facing
// fail-loud tool absent from window.glissade is unusable to them (same rationale
// as gauge/component/motionPath). Only the AUTHOR-facing fail-loud subset is
// re-exported here; the heavy determinism/diff tooling on the same subpath
// (diffDisplayLists/serializeDisplayList/auditCacheCold/the fontUsage validators)
// stays ESM-only (same reasoning as i18n/layout being ESM-only). The SACRED base
// embed pays ZERO bytes — diagnostics never touches the base scene index (the
// "base scene excludes diagnostics" metafile guard covers validate.ts).
export {
  validateScene,
  resolveAt,
  instanceProps,
  DIAGNOSTIC_SCHEMA_VERSION,
  type ValidateSceneResult,
  type SceneDiagnostic,
  type DiagnosticCode,
  type DiagnosticSeverity,
  type InstancePropState,
} from '@glissade/scene/diagnostics';
// 0.60 critique() — machine-readable RENDERED diagnostics (OFF_CANVAS / TEXT_OVERFLOW
// / OCCLUSION) from the DisplayList, the rendered-geometric half of validateScene.
// The no-build author works ONLY against this IIFE, so the author→render→critique→
// self-fix loop needs critique on window.glissade (same rationale as validateScene).
// It needs the node-id stream, so emitWithIds (@glissade/scene/identity — previously
// only on the separate dom.js bundle) is exposed alongside it. Both live on
// tree-shakeable subpaths off the SACRED base embed; the base pays zero bytes.
export {
  critique,
  type CritiqueOptions,
  type CritiqueResult,
  type DiagnosticSource,
  // 0.64 — the reserved caption-band SafeArea primitive (CAPTION_COLLISION).
  type SafeArea,
  // 0.77 — the keep-WITHIN box (OUT_OF_BOUNDS, inverse of SafeArea) + its fail-loud
  // error. CritiqueError is a runtime class (not a type) so a no-build author can
  // `catch (e) { if (e instanceof glissade.CritiqueError) … }` against the IIFE —
  // matching every other error class on the surface (KenBurnsError/MeasurerRequiredError/…).
  type ContainBound,
  // Cut 2 — the EXPLICIT sibling-alignment group type (MISALIGNED + UNEVEN_SPACING).
  // A no-build author declares an alignGroup against window.glissade; the type on the
  // IIFE lets tooling/typedoc name it (mirrors ContainBound/SafeArea).
  type AlignGroup,
  CritiqueError,
} from '@glissade/scene/diagnostics';
// 0.61 — the interchange/edit half of the verification suite on the IIFE: diff(a,b)
// (a ChangeSet TOOL — the no-build author→patch→diff→verify loop) + exportFidelity
// (the static render-only-export DIAGNOSTIC). Both ride the tree-shakeable
// @glissade/scene/diagnostics subpath, off the SACRED base embed.
export {
  diff,
  exportFidelity,
  type ChangeSet,
  type Change,
  type ChangeOp,
  type NodeRef,
  type Region,
  type DiffInput,
  type DiffOptions,
  type ExportFidelityResult,
} from '@glissade/scene/diagnostics';
export { emitWithIds, type EmitWithIdsResult, type NodeIdStream } from '@glissade/scene/identity';
// 0.62 — certKey(scene, timeline?) on window.glissade (kind:'tool'): the pure
// semantic content-address (= sceneHash · timelineHash, NO render) a no-build author
// queries as "will this render be a cache hit?" BEFORE spending the render farm. The
// certify layer's author-facing primitive; joins diff on the tree-shakeable
// @glissade/scene/diagnostics subpath, OFF the SACRED base embed. Consistent with
// diff by construction (shared canonicalScene). sceneHash/timelineHash ride along so
// an author can inspect either half.
export { certKey, sceneHash, timelineHash } from '@glissade/scene/diagnostics';
// 0.63 CAPSTONE — assess(scene, timeline, opts?) on window.glissade (kind:'tool'):
// the ONE composed VERDICT (validateScene + critique + exportFidelity + diff +
// certKey, unified/deduped/prioritized + clean-of-fixable) the no-build agent runs
// its author→assess→auto-fix-geometry→re-assess loop against — its PRIMARY audience,
// so it must reach the IIFE (same rationale as critique/diff). AssessResult carries
// `fixable`/`escalated`/`accepted` partitions + a `signature` (the convergence
// detector), so the loop is fully drivable from the IIFE via assess() alone; the
// helper reads (fixHintsOf/isGeometryFixable/sameDiagnostics) stay ESM-only. Off the
// SACRED base embed.
export { assess, type AssessOptions, type AssessResult } from '@glissade/scene/diagnostics';
// 0.63 recipes — recipe(name, props) instantiates a clean-by-construction starter
// scaffold (kind:'tool'). Importing the subpath ALSO registers describe().recipes
// (the value-type-registry pattern). The no-build agent discovers recipes via
// describe().recipes and instantiates them against the IIFE. Off the base embed.
export { recipe } from '@glissade/scene/recipes';
export type {
  RecipeName,
  Frame,
  LowerThirdProps,
  TitleCardProps,
  StatRevealProps,
  ColdOpenProps,
  RecipePropsByName,
} from '@glissade/scene/recipes';
// 0.24 onboarding: register the runnable example corpus so `window.glissade
// .describe({ examples: true })` surfaces a copy-pasteable, doctest-verified
// snippet per node/builder method/helper — the no-build agent's primary
// onboarding fix. The corpus rides ONLY this convenience bundle (budget bump
// justified below), never the base embed.
// 0.25 (card 7eC7Pb4wTbHj): re-register in NO-BUILD IIFE form — every snippet's
// `import { X } from '...'` rewritten to `const { X } = window.glissade`, so it
// runs VERBATIM in a <script src> page (the bare import already registered the
// npm form; this overrides it, last-write-wins). examplesByKey is a used import,
// so the module's side-effect register runs and isn't tree-shaken.
import { examplesByKey } from '@glissade/scene/examples';
import { registerExamples } from '@glissade/scene/describe';
registerExamples(examplesByKey({ iife: true }));
export * from '@glissade/player';
export { Canvas2DBackend, setShaderRunner } from '@glissade/backend-canvas2d';
// `renderToDataURL` (0.19): the one-shot "screenshot a frame as a data URL" DX
// helper an AI consumer reached for when it couldn't drive a live <canvas>. It
// is DX/screenshot TOOLING, so it lives on the tree-shakeable
// `@glissade/backend-canvas2d/snapshot` subpath — OFF the base embed (the base
// playback path never needs it). The single-file convenience bundle MUST expose
// it though: the Claude-Design no-build consumer works ONLY against this IIFE,
// so a helper absent from window.glissade is unusable to it — and screenshot
// verification is exactly the no-build AI consumer's need. So re-export it here
// (`window.glissade.renderToDataURL` / `snapshotCanvas`); the browser budget was
// raised 46→47 for this +0.36 kB (the convenience bundle, not the base embed).
// Browser-only (OffscreenCanvas/toDataURL).
export { renderToDataURL, snapshotCanvas } from '@glissade/backend-canvas2d/snapshot';
export * from '@glissade/element';

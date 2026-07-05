// @glissade/scene/diagnostics — DEV / CLI determinism-diagnostic surface
// (DESIGN.md §3.3). These modules are side-effect-free and NEVER reached by
// `evaluate()` / the DisplayList render path, so the 0.20 budget review moved
// them OFF the base scene index onto this tree-shakeable subpath — keeping the
// diff/snapshot machinery and the cache-cold audit out of the base-embed budget.
// `gs diff` / `gs verify-determinism` and the golden harness import from here;
// the base embed never pays for it. This subpath is DEBUG-ONLY.
//
// (`tokenHighlight` — the PRODUCTION token-highlight render component — was
// initially grouped here, but it draws VISIBLE UI in real episodes; the
// ai-training finding split it back out onto `@glissade/scene/tokens` so it no
// longer reads as a debug import. The genuine diagnostics below stay.)
//
// (`collapseReplacer` — the byte-preserving cacheKey replacer — is the one piece
// of this cluster that lives ON the render path; it stays in its own
// `collapseReplacer.ts` module and on the base scene index, and is re-exported
// here too for convenience.)

export {
  diffDisplayLists,
  formatDisplayDiff,
  serializeDisplayList,
  parseDisplaySnapshot,
  collapseReplacer,
  DL_SNAPSHOT_VERSION,
  DlSnapshotError,
  type DisplayDiff,
  type CommandDelta,
  type FieldChange,
  type DlSnapshot,
} from './displayDiff.js';

export { auditCacheCold, locateViolation, type CacheColdResult } from './cacheColdAudit.js';

// 0.57 base-budget review: the font-usage collectors + scene-font validator moved
// here off the base scene index (they are CLI / localize / export-path helpers,
// never on the evaluate/render hot path — the same "DEV/CLI surface" rationale as
// the diff/audit machinery above). Recovers ~1.5 kB from the base embed.
export {
  collectTextUsages,
  collectLocalizedTextUsages,
  validateSceneFonts,
  type FontByteLoader,
  type ValidateSceneFontsOptions,
} from './fontUsage.js';

// 0.59 "fail-loud ground floor": the eager scene validator + the truthful read
// primitive (resolveAt) + the instance-level bound indicator + nearest-id
// (Levenshtein). All DIAGNOSTIC — they live here, OFF the base scene index, so
// the sacred base embed pays zero bytes for them (the "base scene excludes
// diagnostics" metafile guard covers validate.ts too).
export {
  validateScene,
  resolveAt,
  instanceProps,
  nearestId,
  levenshtein,
  DIAGNOSTIC_SCHEMA_VERSION,
  type ValidateSceneResult,
  type SceneDiagnostic,
  type DiagnosticCode,
  type DiagnosticSeverity,
  type DiagnosticSource,
  type InstancePropState,
} from './validate.js';

// 0.60 critique() — machine-readable RENDERED diagnostics (OFF_CANVAS / TEXT_OVERFLOW
// / OCCLUSION) from the DisplayList IR, the rendered-geometric half of the boundary
// 0.59 drew. Co-located here with validateScene/resolveAt (OFF the base scene index),
// re-exported onto the browser IIFE. `sortDiagnostics` is exposed for the
// sort-invariance golden guard.
export {
  critique,
  sortDiagnostics,
  type CritiqueOptions,
  type CritiqueResult,
  type FixHint,
  type FixClass,
  // 0.64 — the reserved caption-band primitive (CAPTION_COLLISION + owned-band
  // effective-box + resize-feasibility). A thin wrapper over diff's shared Region.
  type SafeArea,
} from './critique.js';

// 0.61 — the interchange/edit half of the structured-verification suite:
//   • diff(a,b) — a ChangeSet (kind:'tool', NOT a diagnostic — CHANGES not PROBLEMS):
//     the semantic scene-graph + timeline blast-radius of an edit, rendered layer
//     opt-in. Load-bearing invariant: construction-order-only differences → EMPTY.
//   • exportFidelity(scene,timeline?) — a static (no-export) DIAGNOSTIC scan for
//     render-only features (motionBlur/echo/shake/mesh/text-cursor/reveal) that the
//     Lottie exporter drops, hoisted to authoring-time. clean-scene-empty.
// Both live OFF the base scene index (the "base scene excludes diagnostics" guard
// covers diff.ts + fidelity.ts) and are re-exported onto the browser IIFE.
export {
  diff,
  type ChangeSet,
  type Change,
  type ChangeOp,
  type NodeRef,
  type Region,
  type DiffInput,
  type DiffOptions,
} from './diff.js';

export { exportFidelity, type ExportFidelityResult } from './fidelity.js';

// 0.62 — certKey(scene, timeline?): the PURE semantic content-address (kind:'tool',
// NOT a diagnostic — it returns an ADDRESS, not a problem list). = sha256(sceneHash ·
// timelineHash), NO raster render. The "will this render be a cache hit?" primitive
// the certify layer (gs render --certify + the content-addressed render cache) keys
// on. Consistent with diff(a,b) BY CONSTRUCTION — both read canonicalScene.ts's ONE
// canonicalization: `certKey(A)===certKey(B) ⟺ diff(A,B).empty`. sceneHash/
// timelineHash are exposed so the CLI cert folds the SAME hashes (never a second
// canonicalization). All OFF the base scene index; re-exported onto the browser IIFE.
export {
  certKey,
  sceneHash,
  timelineHash,
  canonicalSceneForm,
  canonicalTimelineForm,
  sha256 as certSha256,
  sha256Bytes as certSha256Bytes,
} from './canonicalScene.js';

// 0.63 CAPSTONE — assess(scene, timeline, opts?): the ONE composed VERDICT that ENDS
// Era A. It COMPOSES the shipped suite (validateScene + critique + exportFidelity +
// diff + certKey), UNIFIES/dedupes/PRIORITIZES the diagnostics, and returns
// `clean` (= no error + no geometry-fixable warning, accepted removed + content-only
// escalated) + the certKey trust handle. A PURE composition of the gated primitives
// (deterministic). The agent drives the loop; assess is the framework's verdict.
// fixHintsOf/isGeometryFixable/isContentOnly are the decidable meaning-preservation
// veto reads; diagnosticsSignature/sameDiagnostics are the loop's convergence
// detector. All OFF the base scene index; re-exported onto the browser IIFE (kind:
// 'tool'). See docs/authoring-loop.md.
export {
  assess,
  fixHintsOf,
  isGeometryFixable,
  isContentOnly,
  diagnosticsSignature,
  sameDiagnostics,
  type AssessOptions,
  type AssessResult,
} from './assess.js';

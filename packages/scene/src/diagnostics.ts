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

export { auditCacheCold, type CacheColdResult } from './cacheColdAudit.js';

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

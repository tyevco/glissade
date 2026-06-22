---
"@glissade/core": minor
"@glissade/scene": minor
"@glissade/browser": minor
---

0.20 pre.0: base-embed budget review — relocate sidecar/diagnostics/motion to subpaths + CI-faithful check:size

The base embed (core + scene + canvas2d + player) had crept to 38.79/39 kB gz —
FULL, blocking every embed-touching 0.20 feature. This recovers headroom the
proven way (mirroring the yoga/path/type/snapshot splits): code that is NOT on
the `evaluate()`/render path moves off the base barrels onto tree-shakeable
subpaths. **Base embed: 38.79 → 34.93 kB gz.** The 39 ceiling is unchanged — the
recovered headroom is the 0.20 feature budget.

**Public-API relocation** (these symbols now import from a subpath, not the
package root):

- **`@glissade/core/sidecar`** — the §6.2 editor sidecar
  (`mergeSidecar`/`mergeSidecarDetailed`/`migrateSidecar`/`setSidecarTrack`/
  `deleteSidecarTrack`/`emptySidecar`/`hashKeys`/`assignKeyIds`/
  `normalizeEditedKeys`/`SidecarVersionError` + the `SidecarDoc`/`SidecarOrphan`/…
  types). Studio-only; never on the embed path.
- **`@glissade/scene/diagnostics`** — the §3.3 DEV/CLI determinism substrate
  (`diffDisplayLists`/`formatDisplayDiff`/`serializeDisplayList`/
  `parseDisplaySnapshot`/`DL_SNAPSHOT_VERSION`/`DlSnapshotError`), plus
  `auditCacheCold` and `tokenHighlight`. (`collapseReplacer` — the §3.5 cacheKey
  replacer, the one render-path member — stays on the `@glissade/scene` root.)
- **`@glissade/scene/motion`** — the §3 motion-path follow helper
  (`followPath`/`motionPath`/`pointAtLength`/`pathLength`/`FollowPath`). A
  user-facing opt-in, re-exported onto the `@glissade/browser` IIFE so
  `window.glissade.motionPath` still works for the no-build consumer.

**CI-faithful `check:size`**: the historical fail-then-fix CI delta (CI measured
the base embed ~0.16 kB heavier than local and red-failed a 0.19.1 release) was
caused by `esbuild` (the minifier `check-size.mjs` measures with) being pinned
with a caret — a patch float between local and CI shifted the gz. `esbuild` and
`tsdown` are now pinned EXACT in root + cli, so local == CI byte-for-byte.

All 262 goldens stay byte-identical (pure module-graph moves, no render change).

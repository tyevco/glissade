---
'@glissade/scene': minor
---

**0.61 `gs parity --semantic` + `diff(a,b)` + export-fidelity** — the "what's lost / what changed" pair that completes the agent-perception suite (validateScene + critique + parity + diff), all sharing one diagnostic schema, all byte-deterministic.

- **`gs parity --semantic`** — structured Skia↔Lottie round-trip drop-diff. FUSES the export warn-audit ⊗ the SSIM residual localized to each node's rendered bbox into one finding, `source:'parity'`: `LOTTIE_DROP` / `LOTTIE_APPROXIMATE` / `ANCHOR_RECENTER` (report-only) / `UNEXPLAINED_RESIDUAL` (a residual with NO matching warn = the never-silent alarm) / `BACKEND_DIVERGE` (reserved). Each finding's `expected` is derived from the exporter's OWN warn-list — a warned drop is masked (info/warning), an unexplained residual is the error. Views: default (error-only, no alarm-fatigue) / `--all` / `--baseline` (regression axis). Deterministic residual→node attribution (total order: containing → topmost → id; residual in a warned subtree coalesces to its warned ancestor; region-role feeds severity only). Three machine-assertable correlation invariants make PARITY_BASELINE a generated, self-verifying artifact.

- **`diff(a, b)`** — the blast-radius of an edit as a typed `ChangeSet {added, removed, changed}` (a CHANGE is not a problem — its own `kind:'tool'`, not a diagnostic). Structural (semantic scene-graph tree-diff) default + rendered (DisplayList) opt-in. `diff(a, a)` and construction-order-only differences → empty. On `window.glissade`.

- **`exportFidelity(scene)`** — a static "which render-only features won't survive export" scan (motionBlur/echo/shake/mesh/reveal) queryable at authoring time (`kind:'diagnostic'`, `source:'parity'`), the never-silent export warnings hoisted pre-commit. Clean-scene-empty; actionable per-feature hint.

`diff`/`exportFidelity` join `describe().surface` (kind `'tool'`/`'diagnostic'`, `iife:true`). Additive/pure-read: all 415 goldens byte-identical, base embed unchanged (38.67/39), determinism b4e6060006 held.

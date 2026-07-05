---
"@glissade/scene": minor
"@glissade/cli": minor
---

Determinism trace: `DeterminismViolationError` now names the first node that disagrees. When a scene trips the render-time purity guard (`gs render`/`verifyCert`), the throw runs the shipped per-node cold-re-eval locator (`auditCacheCold`) on the violation branch only — enriching the error with a structured `node` id and first `detail` command-delta, and naming the culprit in the message ("First divergent node 'x'."). Click-to-line instead of a hand-bisect across a long episode. Dev-only and off the render hot path (a clean render re-evaluates nothing and pays nothing); a locator failure can never mask the original violation. Adds `withDeterminismGuards(mode, fn, locate?)`, the `locateViolation(createScene, doc, t)` export on the `@glissade/scene/diagnostics` subpath, and `ViolationDetail`/`ViolationLocator` types.

---
'@glissade/scene': minor
---

**0.60 `critique(scene, timeline)`** — machine-readable RENDERED render diagnostics, the loop-closer that lets an agent SEE and self-fix its own render. The rendered-geometric counterpart to `validateScene()`'s static-structural checks (Era A).

- **`critique(scene, timeline, opts?)`** (on `@glissade/scene/diagnostics`, also on the `window.glissade` IIFE): a layered ONE-call primitive. Runs `validateScene()` first; if static **errors** exist it short-circuits (returns them + `renderedSkipped: true`) rather than emit a cascade of bogus rendered diagnostics from an unbindable scene. Otherwise it binds the scene, samples a fixed integer-frame grid, reads the DisplayList, and emits rendered diagnostics — as a flat, canonically-sorted `diagnostics[]`.

- **MVP codes** (each fires only on real breakage, with an ACTIONABLE fix-hint naming the real `window.glissade` lever + magnitude + direction):
  - **`OFF_CANVAS`** — a node fully outside the frame for its ENTIRE on-stage span (slide-in entrances that start off-frame don't fire).
  - **`TEXT_OVERFLOW`** — measured text ink exceeds its box; downgraded to `info` under the estimating measurer (no confident verdict from estimated metrics).
  - **`OCCLUSION`** — a node fully hidden behind an OPAQUE later node for its whole on-stage span (translucent occluders and brief occlusion never fire; requires `bbox ∩ frame ≠ ∅` so an off-frame node reports `OFF_CANVAS`, not `OCCLUSION` — codes are root-cause-exclusive).

- **`gs critique <scene> [--json]`** — run it headless with the Skia measurer.

- **Diagnostic schema extended additively**: `source: 'validateScene' | 'critique' | 'parity'` (distinguishes a certain static fact from a heuristic rendered judgment) + optional `detail` (the evidence: measured/threshold, occluder, bounds). Codes `TEXT_OVERFLOW`/`OCCLUSION` added; `OFF_CANVAS` (reserved in 0.59) now emitted.

Pure function of the DisplayList → **deterministic, golden-testable, zero new determinism risk** (fixed integer-frame sampling, canonically-sorted output). Additive: all 415 goldens byte-identical, base embed unchanged (38.67/39 — critique lives off the base scene index). `critique(clean-scene)` returns the empty set — verified on all 47 golden scenes.

---
'@glissade/scene': minor
---

critique: add the `OUT_OF_BOUNDS` diagnostic + the `containBounds` option — the INVERSE of `CAPTION_COLLISION`.

An author declares a keep-WITHIN box for a node via `critique(scene, timeline, { containBounds: [{ node, within }] })` (a first-class `ContainBound` type paralleling `SafeArea`). `critique()` raises `OUT_OF_BOUNDS` when the node's rendered composed box is NOT fully inside its declared box for its WHOLE on-stage span (the persistent-drift discipline `OFF_CANVAS`/`CAPTION_COLLISION` use — a transient overshoot during an animation does not fire). An overshoot threshold (>0.5px) drops sub-pixel noise.

Each `within` is ingested through the shared `validateRegion` (integer-quantize + fail-loud on a negative-extent / non-finite box), so a hand-built box and a `describe().types` `Region` reach the check byte-identically. Only nodes with a declared box participate (no cost for others). The diagnostic offers three geometry fix levers — `position` (move it back in), `scale` and `fontSize` (shrink to fit) — all `fixClass:'geometry'` (auto-suggestable). `ContainBound` is registered in `describe().types` and `containBounds` on the `critique` options schema.

`OUT_OF_BOUNDS` is additive to the diagnostic wire contract (no `DIAGNOSTIC_SCHEMA_VERSION` bump). Critique stays RENDER-NEUTRAL — a pure read, never a render input — so every golden frame is byte-identical, and the SACRED base embed is unchanged (critique rides the tree-shakeable `@glissade/scene/diagnostics` subpath).

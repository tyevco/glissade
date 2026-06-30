---
'@glissade/scene': minor
'@glissade/backend-canvas2d': patch
'@glissade/backend-skia': patch
'@glissade/backend-dom': patch
---

fail-loud: the `measureText` / `font.size` contract (0.24 sweep)

A non-finite or non-positive `font.size` used to cascade NaN/0 metrics into zero-height layout boxes — broken wrapping/reveal, with **no error** (the silent-wrong-result class an agent can't glance-test). Now every measurement entry point fails loud:

- new `assertFiniteFontSize(font, where)` (exported from `@glissade/scene`) — throws an actionable error naming the common `size`-vs-`fontSize` gotcha (the FontSpec field is `size`, not the Text-node `fontSize`).
- enforced at the `breakLines` chokepoint (covers `intrinsicSize`/`lineBoxes`/`wordBoxes`/`measureWrappedText`) and at all three backend `measureText`s (the contract boundary).

Valid sizes are unaffected — the 262 goldens are byte-identical. (Audited and verified NOT bugs, so unchanged: `track.ts` pre-first-key clamping, `grid.ts` single-row `cellHeight`, empty-text 0 metrics, degenerate gradients/rng.)

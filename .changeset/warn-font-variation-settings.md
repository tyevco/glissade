---
'@glissade/scene': patch
---

0.19.1 pitstop: warn on dropped `fontVariationSettings` instead of silently
swallowing it. Variable-font axes (`wght`, `opsz`, …) are not yet wired to
either rasterizer, so a `Text` that passes variation settings used to vanish
with no signal — the same footgun class as the splitText estimating-measurer
(which 0.19 made loud).

`Text` now accepts a typed `fontVariationSettings?` prop: setting it emits a
dev-warning naming the dropped value and that axes aren't applied yet, and the
value is introspectable on the node but never threaded into `FontSpec`/`ctx.font`.
Default `Text` (no variations) is unchanged and byte-identical — the 262 goldens
hold. Animatable axes remain a 0.20 feature; pick a weight via the discrete
`fontWeight` named instance today. Documented in `docs/typewriter.md`.

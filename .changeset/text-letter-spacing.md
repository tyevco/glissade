---
'@glissade/scene': minor
---

Text: `letterSpacing` (tracking) — a cross-backend typography property

`Text` gains a static `letterSpacing` prop (px between glyphs; negative tightens). It threads through the `FontSpec` to every backend 1:1 — `ctx.letterSpacing` on canvas2d **and** the Skia export path (`@napi-rs/canvas` honors it in render *and* `measureText`, so wrapping stays correct), and CSS `letter-spacing` on the DOM backend. `splitText` parts inherit it, and `describe()` lists it (construction-only — static, not a track target in 0.21).

Additive and golden-neutral: a Text without `letterSpacing` emits a byte-identical `FontSpec`, so all existing goldens are unchanged; a new `letter-spacing` golden proves the tracking reaches the glyphs on Skia. For em-relative tracking pass `em * fontSize`.

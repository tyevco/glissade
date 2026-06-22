---
"@glissade/scene": minor
"@glissade/backend-skia": minor
"@glissade/backend-canvas2d": minor
---

0.20: variable-font passthrough (`fontVariationSettings` → Skia rasterizer) + animation-deferred

The 0.19.1 typed `Text.fontVariationSettings` prop was accepted-and-DROPPED (no
rasterizer wiring). 0.20 WIRES it as **static passthrough**: the axis string
threads `Text → FontSpec.fontVariationSettings → ctx.fontVariationSettings` and
is applied by the rasterizer where the 2D context supports it.

- **Skia / export path** (`@napi-rs/canvas`) exposes a settable
  `ctx.fontVariationSettings`, so the axes reach the glyphs — a heavier `"wght"`
  renders distinctly, and a mid weight no discrete named instance can reach (e.g.
  `"wght" 550`) is now expressible. The new `golden-variable-font` corpus pins
  three weights of one variable face rendering distinctly — the byte-exact proof
  the axis is applied, not dropped. The measurer applies the same axes, so
  line-breaking/box metrics match the draw.
- **Browser** (DOM 2D canvas) has no `fontVariationSettings` property, so axes
  are **best-effort** there — a guarded no-op (never a throw), with a one-time
  dev-warning that the value wasn't applied. For perfect cross-backend parity,
  instance the face to a static sfnt at ingest (the `font-instanced` golden).

**Default Text is byte-identical:** the axis key is OMITTED from the FontSpec
when unset (all measure/layout/draw sites route through one `Text.fontSpec()`
that spreads it conditionally), so the 262 pre-existing goldens stay
byte-for-byte unchanged.

**Animatable axes stay deferred to 1.0** (an opaque CSS string isn't
interpolatable). `fontVariationSettings` is not a bindable target, so a timeline
track on `<id>/fontVariationSettings` hard-throws `UnboundTargetError` — the
loud signal for the deferred-animation case, not a silent drop. Use discrete
`fontWeight` named instances for a weight that changes over time.

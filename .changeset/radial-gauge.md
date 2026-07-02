---
'@glissade/scene': minor
'@glissade/browser': minor
---

0.38: `Gauge()` / `Meter()` — radial data-viz gauges (the Chart companion)

A pure build-time fan-out (like `Chart()`/`Grid()`) on the tree-shakeable
`@glissade/scene/gauge` subpath: a spec → N categorical stroked-arc **zones** +
boundary **ticks** + a **needle** + separate **labels**, returning an ordinary
`Group`. Byte-exact on Skia; every part independently animatable.

- **Two needle modes**: authored angle keyframes (`tl.to(g.targets('needle',
  'rotation'), …)`, 0 = straight up, + = clockwise), or **Meter** value→angle
  (`Meter({ value, domain })`; a `() => value` signal binds live).
- **Independent channels**: zones, ticks, needle, and labels are each their own
  addressable child (`zone-{i}`, `tick-{i}`, `needle`, `label-{i}`, `glow`), and
  labels draw z-above the zone decoration — so a zone can dim or tint *without*
  crushing its label's contrast (zone opacity and label opacity are separate).
- **Categorical zones** with per-zone color/label + configurable gap/thickness,
  so a labeled trust/quality/status dial is a spec, not hand-rolled arc geometry.
- Surfaced in `describe().helpers` and re-exported on the browser bundle as
  `window.glissade.Gauge` / `Meter`. A `golden-gauge` showcase scene ships in the
  gallery + golden corpus.

Base embed unchanged (38.83/39 — gauge is subpath-only, asserted by a metafile
guard); determinism hash and all existing goldens unchanged.

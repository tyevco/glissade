---
'@glissade/scene': minor
---

0.58 papercuts: gradient smooth/gaussian bloom export + typeOn `cursorFill`.

- **Gradient smooth/gaussian export (Lottie)**: a radial gradient's `interpolation: 'smooth' | 'gaussian'` now exports faithfully. The `gf` format has no smooth mode, so the exporter densifies the ramp into the same 64-stop OKLab approximation the render path already uses (`densifyStops`, now reachable via the new `@glissade/scene/gradient` subpath) — closing a render-vs-export gap. Round-trips at perceptual parity (SSIM ~1.0) instead of a hard-ramp disc. Never-silent: linear/default gradients are byte-identical; a degenerate gradient that can't be densified falls back to a hard linear ramp with a warning. Render path untouched (goldens byte-identical).
- **typeOn `cursorFill` / `cursorProps`**: the `typeOn({ cursor: true })` caret can now take its own fill (and other textCursor props) instead of being capped to the text fill — a differently-colored caret is reachable without dropping to raw `textCursor()`.

Off the base embed; determinism unchanged. (camera `centerOn(node)` was scoped but deferred — a correct node→relative-center resolution needs draw-time size + world transform + anchor/text-bounds, out of scope for a papercut.)

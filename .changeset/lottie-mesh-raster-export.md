---
"@glissade/lottie": minor
"@glissade/cli": minor
---

Mesh gradient fills now export to Lottie as a rasterized image layer.

Lottie has no mesh-gradient primitive, so `kind:'mesh'` fills previously warn-dropped on export — a full-canvas mesh/aurora backdrop collapsed to nothing on the round-trip (~0.10 SSIM on real content). `exportLottie` now rasterizes the mesh (via `scene`'s pure, deterministic `rasterizeMesh`) and embeds it as a `ty:2` image layer positioned at the fill's bounds, recovering the round-trip to full parity (frame-0 SSIM ~0.026/0.10 → 1.0). The PNG encoder is threaded in via a new `ExportOptions.encodePng` callback (so `@glissade/lottie` stays DOM/Node-free — `gs export` and the `gs parity` lottie leg supply a Skia-backed encoder); `gs render`/`gs parity` also gained a `data:`-URL image-decode branch so the embedded PNG renders back.

Gated on `kind:'mesh'` **and** an encoder being present, so every non-mesh export and the no-encoder path stay byte-identical. MVP flattens an *animated* mesh to a static raster (its first key) with a warning — per-frame mesh animation is a documented follow-up. Import already supported `ty:2` image assets, so the round-trip is symmetric.

---
"@glissade/core": minor
"@glissade/scene": minor
---

feat(paint): mesh-gradient Paint — one native, animatable aurora fill (§3 Paint)

A native `mesh` Paint: N color points blended across a node's [0,1]² fill
rectangle as ONE animatable fill, registered in the Paint union beside
`linear`/`radial`. The native replacement for the "N blurred blobs" aurora
backdrop (the consumer's #1 render-cost pain). `points[i].pos`/`color` are
animatable, so `track('node/fill.points.0.color', 'paint', …)` drives aurora
drift on a single node.

The determinism tentpole of the milestone — dual-backend parity is the
deliverable. A decisive finding (@napi-rs/canvas exposes no SkSL
`RuntimeEffect`/`makeShader`) means there is NO SkSL-vs-fallback fork: there is
exactly ONE shared CPU kernel both backends run.

- `@glissade/core`: a `mesh` Paint variant (`MeshPaint`/`MeshPoint`/
  `MeshInterpolation`) in the animatable Paint union. `paintType` lerps
  matched-count meshes pairwise (point `pos` + OKLab `color`; `interpolation`/
  `bg` carried as discrete metadata) and snaps on a mismatched point count or
  cross-kind — the path/paint precedent. Cross-kind lift (solid→uniform-mesh)
  is deferred.
- `@glissade/scene`: `meshGradient.ts` — the shared deterministic kernel: one
  Shepard inverse-distance blend with a colorspace knob (`smooth`/`oklab` = IDW
  in OKLab, `gaussian` = a pinned-sigma weight), pinned named constants
  (`MESH_SIGMA`, `MESH_SHEPARD_POWER`, `MESH_DOWNSCALE`), OKLab math reused
  bit-identically from core, and `Uint8ClampedArray` integer quantization so the
  source buffer is reproducible run-to-run and identical across backends. The
  `Raster2D` fill branch blits it via `clip(path) + drawImage(meshTile → bounds)`
  with `imageSmoothingEnabled` pinned (a cross-backend parity spike rejected
  `createPattern` for edge-AA/alpha contamination + an uncontrolled resample
  filter). NO triangulator (Gouraud/Delaunay/Coons deferred).

Determinism gates met: Skia golden per-path byte-exact (a new `golden-mesh`
aurora scene; all existing goldens byte-identical — additive Paint kind);
browser↔Skia SSIM ≥ 0.97 (mesh added to the PARITY suite — the shared kernel
emits an identical source ImageData on both, only the final blit AA differs);
RASTER_CACHE on == off byte-for-byte (mesh adds no per-frame state — it rides
the §3.5 group cache); only deterministic math (exp/hypot/cbrt), no
Date/Math.random. A stroke/text mesh paint degrades to a deterministic
representative solid with a one-time dev warning.

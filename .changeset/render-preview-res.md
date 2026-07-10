---
"@glissade/cli": minor
"@glissade/backend-skia": minor
---

`gs render --preview --preview-res <f>`: a two-tier render **scale** knob that
renders a watchable DRAFT at f× the OUTPUT RASTER resolution — the whole
composition rasterized into a `round(w*f)×round(h*f)` canvas (fewer pixels to
rasterize = the real render-time win for raster-bound scenes). `0 < f ≤ 1`.

PREVIEW-ONLY, "scale ⇒ non-final": `--preview-res` REQUIRES `--preview`; passed
without it (or with `--final`) it fails loud — a scaled render is a draft, so the
certified/production master is structurally full-res and goldens can never be
scaled. `f === 1` (or no flag) takes the EXACT current unscaled code path, so a
default render is **byte-identical** to before (goldens unchanged, determinism
hash held).

The scale is applied at the BACKEND OUTPUT raster layer (a new opt-in
`SkiaBackend` `outputScale` param), ON TOP OF the already-composited DisplayList,
at the EFFECTIVE scale `scaledDim/origDim` (not the raw `f`) so the composition
exactly FILLS the scaled canvas (no edge gap from the canonical `round()`). It is
ORTHOGONAL to a node's `.scale` scene transform (scene transform first, then
output raster scale — never multiplied into one). The scaled output dims flow to
`renderConfig` (cert), the frame cache key, the layer cache, and the encode — so a
scaled frame's certHash/cache key auto-distinguishes it from full-res (and per
factor): free cross-tier isolation, no cross-serve. Threaded through the
`--workers`/`--incremental` shard children too.

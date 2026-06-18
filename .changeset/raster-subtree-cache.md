---
'@glissade/scene': minor
---

Add the **cross-frame subtree raster cache** (§3.5, card ScMm) — an opt-in bitmap
LRU that re-blits an unchanged subtree under a moving parent instead of
re-rasterizing it, shared by **both** backends (Canvas2D and the golden-tested
Skia/CLI path) through the one `Raster2D`.

- **Opt-in via `cache?: boolean` on `NodeProps`.** A `cache:true` node FORCES a
  group (so an opacity-1 / source-over / no-filter static subtree becomes
  cacheable) and stamps a `cacheKey` on its `pushGroup`. Strictly gated: a scene
  that never sets `cache` emits **zero** new groups and is **byte-identical** to
  before. No auto-heuristic.
- **`cacheKey = FNV-1a(group's command slice + the full content of every
  referenced resource)`**, computed in `Node.emit` from the already-emitted plain
  DisplayList via a stable serializer (resource ids are remapped to local
  ordinals; opaque buffers collapse to a length marker, mirroring the cache-cold
  audit). The group's live opacity/blend/filter stay OUT of the key — they're
  applied on the composite, not baked into the bitmap.
- **The LRU key is `cacheKey` AND the inherited DEVICE transform** (rounded to
  1e-4 to shed float jitter). The layer is rasterized in device space, so a HIT
  blits at identity — keying on the transform too is what makes a stale-CTM blit
  impossible and the cache provably byte-identical.
- **Pure performance layer.** Cache-enabled output is byte-for-byte identical to
  cache-disabled output (the non-negotiable AC, gate-tested both ways); the cache
  is disabled with the `RASTER_CACHE=0` env var or a `Raster2D` constructor flag.
  Hardcoded LRU cap of 16; evicted canvases return to the raster pool.

New public surface on `@glissade/scene`: `cache?` on `NodeProps`, `Node.cache`,
the optional `mark`/`cacheKey`/`patchCacheKey` seam on `DisplayListBuilder`, and a
`cacheEnabled` constructor param on `Raster2D`.

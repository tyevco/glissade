---
'@glissade/cli': minor
'@glissade/backend-skia': minor
---

feat(render): persistent whole-frame raster cache (`.gscache`) — content-addressed disk cache (§3.5)

`gs render --cache [<dir>] [--cache-max-size <bytes|2GB>]` (and `render({ cache: { dir, mode } })`)
adds a persistent whole-frame raster cache so a one-line edit doesn't re-rasterize every blur-heavy
frame across runs/shards. OFF by default (`mode:'off'`), preserving the exact current equality
baseline — opting in only changes speed, never output.

- **Whole-frame granularity** (per-group disk tiling deferred to 0.13): the key is over the ENTIRE
  frame's DisplayList, so a hit is byte-safe by construction.
- **Complete key:** `sha256(serializeDisplayList(frame) ++ glissadeVersion ++ capsId)` — folds the
  DisplayList-snapshot bytes (geometry/paint/transform), the glissade version (bump-on-version
  invalidation), and the BackendCaps id. version/capsId are INJECTED via `CacheKeyContext`.
- **HIT == MISS:** a hit loads stored RGBA into the backend (`SkiaBackend.putPixels`) and encodes
  through the IDENTICAL `encodePng` path, so it is byte-identical to a cold render.
- **Storage:** raw-RGBA + zlib, one atomically-written file per frame. Shards share one `.gscache`.
- **Size-capped LRU from day one** (default 2 GB, mtime/access-time ordered).
- **`gs cache verify <scene>`:** renders cache-hits vs cache-off and asserts the `encodePng` bytes
  are equal frame-for-frame (a sampled fraction is logged). A NEGATIVE test proves an incomplete key
  makes the gate fail.

Honesty: the cache wins repeated renders + the unchanged-prefix of a single-segment edit. A full
re-narrate shifts every frame's timing → every DisplayList changes → every frame misses.

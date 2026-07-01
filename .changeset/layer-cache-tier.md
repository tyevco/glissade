---
"@glissade/scene": patch
"@glissade/backend-skia": patch
"@glissade/cli": patch
---

`gs render --cache`: disk-persistent **layer-cache tier** — a static subtree survives a re-narration

The whole-frame cache (0.27) is defeated by a re-narration: new TTS shifts beats, so captions/timing frames change and every frame key flips. But an expensive *static* subtree — a blurred mesh backdrop — is byte-identical across all of it. Its in-memory raster cache (§3.5) only spanned one render; now `--cache` also persists a `cache:true` group's device-space raster to disk (`.gscache/layers/`), so it rasterizes ONCE and re-blits on later renders even when the whole-frame cache misses.

- **`@glissade/scene`**: the compositor (`raster2d.ts`) gains an injected `LayerStore` seam (`get`/`put` of a device-space RGBA + bounds). On an in-memory miss it consults the store and promotes the hit to RAM; on a store it persists the layer once. Scene stays Node-dep-free — the store is injected. `Ctx2DLike` gains `getImageData`.
- **`@glissade/backend-skia`**: `new SkiaBackend(w, h, { layerStore })` / `backend.setLayerStore(...)`.
- **`@glissade/cli`**: an fs-backed `LayerCache` (deflated RGBA + bounds, atomic, content-addressed) whose key is salted with the toolchain version ⊕ backend caps ⊕ frame size; wired into `render.ts` under `--cache`.

A restored layer composites **byte-identically** to a fresh raster (RGBA round-trips through `putImageData`) — proven end-to-end. The tier is purely additive and opt-in: with no `--cache` (or `RASTER_CACHE=0`) the output is unchanged, and all 325 goldens stay byte-identical.

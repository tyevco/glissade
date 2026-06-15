---
'@glissade/scene': minor
'@glissade/backend-skia': patch
'@glissade/backend-canvas2d': patch
---

Declare a `RenderBackend` interface (§3.4) in `@glissade/scene` — the renderer extension seam both v1 backends now `implement`. It `extends TextMeasurer` and adds a queryable `caps: { filters, shaders, maxTextureSize }`, `render`, `readPixels(): Promise<Uint8ClampedArray>` (reconciling Skia's previously-sync readPixels to the Promise contract so callers await uniformly), an optional `toVideoFrame`, and the asset setters. `SkiaBackend.caps.shaders` is `false` (headless CPU); `Canvas2DBackend.caps.shaders` reflects whether an effects-webgpu runner is registered. `ShaderRef` gains an optional reserved `textures` map for future multi-input passes.

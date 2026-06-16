# @glissade/backend-canvas2d

## 0.8.0

### Patch Changes

- 7290397: Declare a `RenderBackend` interface (§3.4) in `@glissade/scene` — the renderer extension seam both v1 backends now `implement`. It `extends TextMeasurer` and adds a queryable `caps: { filters, shaders, maxTextureSize }`, `render`, `readPixels(): Promise<Uint8ClampedArray>` (reconciling Skia's previously-sync readPixels to the Promise contract so callers await uniformly), an optional `toVideoFrame`, and the asset setters. `SkiaBackend.caps.shaders` is `false` (headless CPU); `Canvas2DBackend.caps.shaders` reflects whether an effects-webgpu runner is registered. `ShaderRef` gains an optional reserved `textures` map for future multi-input passes.
- Updated dependencies [1d56c0a]
- Updated dependencies [dac15c9]
- Updated dependencies [7290397]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0
  - @glissade/scene@0.8.0

## 0.8.0-pre.1

### Patch Changes

- Updated dependencies [dac15c9]
  - @glissade/core@0.8.0-pre.1
  - @glissade/scene@0.8.0-pre.1

## 0.8.0-pre.0

### Patch Changes

- 7290397: Declare a `RenderBackend` interface (§3.4) in `@glissade/scene` — the renderer extension seam both v1 backends now `implement`. It `extends TextMeasurer` and adds a queryable `caps: { filters, shaders, maxTextureSize }`, `render`, `readPixels(): Promise<Uint8ClampedArray>` (reconciling Skia's previously-sync readPixels to the Promise contract so callers await uniformly), an optional `toVideoFrame`, and the asset setters. `SkiaBackend.caps.shaders` is `false` (headless CPU); `Canvas2DBackend.caps.shaders` reflects whether an effects-webgpu runner is registered. `ShaderRef` gains an optional reserved `textures` map for future multi-input passes.
- Updated dependencies [1d56c0a]
- Updated dependencies [7290397]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0-pre.0
  - @glissade/scene@0.8.0-pre.0

## 0.7.0

### Patch Changes

- Updated dependencies [0c0a583]
- Updated dependencies [9a360b2]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [9aa42e6]
- Updated dependencies [25c5986]
- Updated dependencies [ecdece8]
  - @glissade/core@0.7.0
  - @glissade/scene@0.7.0

## 0.7.0-pre.0

### Patch Changes

- Updated dependencies [0c0a583]
- Updated dependencies [9a360b2]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [9aa42e6]
- Updated dependencies [25c5986]
- Updated dependencies [ecdece8]
  - @glissade/core@0.7.0-pre.0
  - @glissade/scene@0.7.0-pre.0

## 0.6.1

### Patch Changes

- @glissade/core@0.6.1
- @glissade/scene@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [6c07c96]
- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
- Updated dependencies [12c5841]
- Updated dependencies [977b3d5]
  - @glissade/core@0.6.0
  - @glissade/scene@0.6.0

## 0.6.0-pre.1

### Patch Changes

- Updated dependencies [6c07c96]
- Updated dependencies [977b3d5]
  - @glissade/core@0.6.0-pre.1
  - @glissade/scene@0.6.0-pre.1

## 0.6.0-pre.0

### Patch Changes

- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
  - @glissade/scene@0.6.0-pre.0
  - @glissade/core@0.6.0-pre.0

## 0.5.0

### Patch Changes

- Updated dependencies [ca2150f]
- Updated dependencies [e1865d2]
- Updated dependencies [d679e81]
- Updated dependencies [8f631ab]
- Updated dependencies [4e93a59]
- Updated dependencies [43b326b]
- Updated dependencies [adc7941]
- Updated dependencies [27b4b49]
- Updated dependencies [4495359]
  - @glissade/scene@0.5.0
  - @glissade/core@0.5.0

## 0.5.0-pre.7

### Patch Changes

- @glissade/core@0.5.0-pre.7
- @glissade/scene@0.5.0-pre.7

## 0.5.0-pre.6

### Patch Changes

- Updated dependencies [d679e81]
- Updated dependencies [8f631ab]
- Updated dependencies [4e93a59]
- Updated dependencies [adc7941]
  - @glissade/scene@0.5.0-pre.6
  - @glissade/core@0.5.0-pre.6

## 0.5.0-pre.5

### Patch Changes

- Updated dependencies [4495359]
  - @glissade/scene@0.5.0-pre.5
  - @glissade/core@0.5.0-pre.5

## 0.5.0-pre.4

### Patch Changes

- Updated dependencies [ca2150f]
  - @glissade/scene@0.5.0-pre.4
  - @glissade/core@0.5.0-pre.4

## 0.5.0-pre.3

### Patch Changes

- Updated dependencies [e1865d2]
- Updated dependencies [43b326b]
  - @glissade/scene@0.5.0-pre.3
  - @glissade/core@0.5.0-pre.3

## 0.5.0-pre.2

### Patch Changes

- Updated dependencies [27b4b49]
  - @glissade/scene@0.5.0-pre.2
  - @glissade/core@0.5.0-pre.2

## 0.5.0-pre.1

### Patch Changes

- @glissade/core@0.5.0-pre.1
- @glissade/scene@0.5.0-pre.1

## 0.5.0-pre.0

### Patch Changes

- @glissade/core@0.5.0-pre.0
- @glissade/scene@0.5.0-pre.0

## 0.4.5

### Patch Changes

- Updated dependencies [70159ad]
  - @glissade/scene@0.4.5
  - @glissade/core@0.4.5

## 0.4.4

### Patch Changes

- Updated dependencies [40f5a31]
  - @glissade/scene@0.4.4
  - @glissade/core@0.4.4

## 0.4.3

### Patch Changes

- Updated dependencies [2282bcb]
  - @glissade/scene@0.4.3
  - @glissade/core@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies [53f6f9f]
  - @glissade/scene@0.4.2
  - @glissade/core@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [80d9ac1]
  - @glissade/scene@0.4.1
  - @glissade/core@0.4.1

## 0.4.0

### Minor Changes

- 3986798: WebGPU shader effects (§3.7). `ShaderEffect` is a group whose rasterized subtree runs through a WGSL pass — uniforms are per-name signals registered as `u.<name>` track targets, so shader params animate like any property. The node and `ShaderRef` IR are PURE DATA in scene; the GPU lives only in the new browser-only `@glissade/effects-webgpu` (never importable by the headless pipeline — §7.1-enforced): `loadWebGPUEffects()` calibrates the present path (zero-latency sync on hardware, one-frame-deferred on stacks that present late), with byte-upload and acquisition-deadline fallbacks for hostile environments. Built-in `effects.noiseDisplace` (animated value-noise displacement — perlin-style warps) and `effects.grain`. Headless and webgpu-less browsers degrade per `caps.shaders`: passthrough with one warning by default, hard error opt-in. Explicitly outside the determinism guarantee.

### Patch Changes

- Updated dependencies [056817c]
- Updated dependencies [869d406]
- Updated dependencies [3986798]
  - @glissade/scene@0.4.0
  - @glissade/core@0.4.0

## 0.3.0

### Minor Changes

- fbb12ca: Group filters (§3.4): `FilterSpec` is now a closed, validated union — `blur`, `drop-shadow`, `brightness`, `contrast`, `saturate` — never a CSS passthrough string. Nodes take `filters` as a prop (it's a signal, so a computed binding animates a blur radius from ordinary tracks), filtered subtrees composite as a unit, and both backends apply the compiled filter on the group's composite draw. Skia output is golden-pinned per filter; browser↔Skia parity measured at SSIM ≥ 0.9992 on the filters corpus — no per-filter exclusions needed.

### Patch Changes

- bc9add6: The shared `Raster2D` interpreter: one DisplayList command walk in `@glissade/scene`, generic over the host's canvas/path/drawable flavor. Both backends become thin adapters (context acquisition + a path constructor + a layer-canvas factory), so the twin rasterizers structurally cannot drift. Behavior-identical: every golden frame byte-matches through the refactor and the SSIM parity suite is unchanged. `Raster2D`, `fontString`, and the host interfaces are exported for future backends.
- Updated dependencies [fbb12ca]
- Updated dependencies [ab8ca37]
- Updated dependencies [bc9add6]
- Updated dependencies [e89c3d0]
  - @glissade/scene@0.3.0
  - @glissade/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [715be32]
- Updated dependencies [dcb28f2]
  - @glissade/core@0.2.0
  - @glissade/scene@0.2.0

## 0.1.0

### Minor Changes

- First public release.

  glissade is a TypeScript framework for programmatic motion graphics built on
  one contract: `evaluate(scene, timeline, t)` is a pure function of time. No
  generator functions — animations are serializable keyframe documents authored
  via a fluent builder or raw data.

  - Pull-based signals (lazy, cached, dependency-tracked) driving a
    renderer-agnostic scene graph with a flat DisplayList IR
  - Canvas 2D (browser) and Skia (headless CLI) backends with golden-frame CI:
    frames byte-compare across machines on a pinned toolchain — including text
    (explicit fonts) and flexbox layout (Yoga behind the LayoutEngine seam)
  - `gs render` CLI: PNG sequences or mp4/webm with mixed audio, encoder
    feature detection, video assets via FFmpeg extraction
  - In-browser export via WebCodecs + Mediabunny, faster than realtime, with
    sample-accurate OfflineAudioContext audio and bidirectional video scrub
  - Time-based Player with a Driver seam (rAF clock, scroll), `<gs-player>`
    custom element (~1 kB), React bindings
  - `bake()`: stateful simulation compiled to ordinary keyframe tracks
  - A React studio with draggable keyframes persisted to git-diffable sidecars
    that survive code edits

### Patch Changes

- Updated dependencies
  - @glissade/core@0.1.0
  - @glissade/scene@0.1.0

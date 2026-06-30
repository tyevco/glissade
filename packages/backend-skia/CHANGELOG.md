# @glissade/backend-skia

## 0.24.0-pre.2

### Patch Changes

- @glissade/core@0.24.0-pre.2
- @glissade/scene@0.24.0-pre.2

## 0.24.0-pre.1

### Patch Changes

- 096e988: fail-loud: the `measureText` / `font.size` contract (0.24 sweep)

  A non-finite or non-positive `font.size` used to cascade NaN/0 metrics into zero-height layout boxes — broken wrapping/reveal, with **no error** (the silent-wrong-result class an agent can't glance-test). Now every measurement entry point fails loud:

  - new `assertFiniteFontSize(font, where)` (exported from `@glissade/scene`) — throws an actionable error naming the common `size`-vs-`fontSize` gotcha (the FontSpec field is `size`, not the Text-node `fontSize`).
  - enforced at the `breakLines` chokepoint (covers `intrinsicSize`/`lineBoxes`/`wordBoxes`/`measureWrappedText`) and at all three backend `measureText`s (the contract boundary).

  Valid sizes are unaffected — the 262 goldens are byte-identical. (Audited and verified NOT bugs, so unchanged: `track.ts` pre-first-key clamping, `grid.ts` single-row `cellHeight`, empty-text 0 metrics, degenerate gradients/rng.)

- Updated dependencies [096e988]
  - @glissade/scene@0.24.0-pre.1
  - @glissade/core@0.24.0-pre.1

## 0.24.0-pre.0

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.24.0-pre.0
  - @glissade/core@0.24.0-pre.0

## 0.23.0

### Patch Changes

- Updated dependencies [8209c61]
- Updated dependencies [e54d593]
- Updated dependencies [33077e8]
- Updated dependencies [7c8f184]
  - @glissade/core@0.23.0
  - @glissade/scene@0.23.0

## 0.23.0-pre.5

### Patch Changes

- Updated dependencies [e54d593]
  - @glissade/core@0.23.0-pre.5
  - @glissade/scene@0.23.0-pre.5

## 0.23.0-pre.4

### Patch Changes

- @glissade/core@0.23.0-pre.4
- @glissade/scene@0.23.0-pre.4

## 0.23.0-pre.3

### Patch Changes

- Updated dependencies [33077e8]
  - @glissade/scene@0.23.0-pre.3
  - @glissade/core@0.23.0-pre.3

## 0.23.0-pre.2

### Patch Changes

- @glissade/core@0.23.0-pre.2
- @glissade/scene@0.23.0-pre.2

## 0.23.0-pre.1

### Patch Changes

- Updated dependencies [8209c61]
  - @glissade/core@0.23.0-pre.1
  - @glissade/scene@0.23.0-pre.1

## 0.23.0-pre.0

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.23.0-pre.0
  - @glissade/core@0.23.0-pre.0

## 0.22.0

### Patch Changes

- Updated dependencies [42d281e]
- Updated dependencies [095cfd2]
  - @glissade/scene@0.22.0
  - @glissade/core@0.22.0

## 0.22.0-pre.5

### Patch Changes

- @glissade/core@0.22.0-pre.5
- @glissade/scene@0.22.0-pre.5

## 0.22.0-pre.4

### Patch Changes

- @glissade/core@0.22.0-pre.4
- @glissade/scene@0.22.0-pre.4

## 0.22.0-pre.3

### Patch Changes

- Updated dependencies [42d281e]
  - @glissade/scene@0.22.0-pre.3
  - @glissade/core@0.22.0-pre.3

## 0.22.0-pre.2

### Patch Changes

- @glissade/core@0.22.0-pre.2
- @glissade/scene@0.22.0-pre.2

## 0.22.0-pre.1

### Patch Changes

- @glissade/core@0.22.0-pre.1
- @glissade/scene@0.22.0-pre.1

## 0.22.0-pre.0

### Patch Changes

- Updated dependencies [095cfd2]
  - @glissade/scene@0.22.0-pre.0
  - @glissade/core@0.22.0-pre.0

## 0.21.0

### Patch Changes

- Updated dependencies [c954768]
  - @glissade/scene@0.21.0
  - @glissade/core@0.21.0

## 0.21.0-pre.4

### Patch Changes

- @glissade/core@0.21.0-pre.4
- @glissade/scene@0.21.0-pre.4

## 0.21.0-pre.3

### Patch Changes

- @glissade/core@0.21.0-pre.3
- @glissade/scene@0.21.0-pre.3

## 0.21.0-pre.2

### Patch Changes

- @glissade/core@0.21.0-pre.2
- @glissade/scene@0.21.0-pre.2

## 0.21.0-pre.1

### Patch Changes

- @glissade/core@0.21.0-pre.1
- @glissade/scene@0.21.0-pre.1

## 0.21.0-pre.0

### Patch Changes

- Updated dependencies [c954768]
  - @glissade/scene@0.21.0-pre.0
  - @glissade/core@0.21.0-pre.0

## 0.20.1

### Patch Changes

- Updated dependencies [86ae703]
  - @glissade/scene@0.20.1
  - @glissade/core@0.20.1

## 0.20.1-pre.0

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.20.1-pre.0
  - @glissade/core@0.20.1-pre.0

## 0.20.0

### Minor Changes

- 3760b47: 0.20: variable-font passthrough (`fontVariationSettings` → Skia rasterizer) + animation-deferred

  The 0.19.1 typed `Text.fontVariationSettings` prop was accepted-and-DROPPED (no
  rasterizer wiring). 0.20 WIRES it as **static passthrough**: the axis string
  threads `Text → FontSpec.fontVariationSettings → ctx.fontVariationSettings` and
  is applied by the rasterizer where the 2D context supports it.

  - **Skia / export path** (`@napi-rs/canvas`) exposes a settable
    `ctx.fontVariationSettings`, so the axes reach the glyphs — a heavier `"wght"`
    renders distinctly, and a mid weight no discrete named instance can reach (e.g.
    `"wght" 550`) is now expressible. The new `golden-variable-font` corpus pins
    three weights of one variable face rendering distinctly — the byte-exact proof
    the axis is applied, not dropped. The measurer applies the same axes, so
    line-breaking/box metrics match the draw.
  - **Browser** (DOM 2D canvas) has no `fontVariationSettings` property, so axes
    are **best-effort** there — a guarded no-op (never a throw), with a one-time
    dev-warning that the value wasn't applied. For perfect cross-backend parity,
    instance the face to a static sfnt at ingest (the `font-instanced` golden).

  **Default Text is byte-identical:** the axis key is OMITTED from the FontSpec
  when unset (all measure/layout/draw sites route through one `Text.fontSpec()`
  that spreads it conditionally), so the 262 pre-existing goldens stay
  byte-for-byte unchanged.

  **Animatable axes stay deferred to 1.0** (an opaque CSS string isn't
  interpolatable). `fontVariationSettings` is not a bindable target, so a timeline
  track on `<id>/fontVariationSettings` hard-throws `UnboundTargetError` — the
  loud signal for the deferred-animation case, not a silent drop. Use discrete
  `fontWeight` named instances for a weight that changes over time.

### Patch Changes

- Updated dependencies [c629b51]
- Updated dependencies [519e1f8]
- Updated dependencies [0f5b066]
- Updated dependencies [1bd4507]
- Updated dependencies [fffa420]
- Updated dependencies [2a30be9]
- Updated dependencies [4a2117f]
- Updated dependencies [fd12bb8]
- Updated dependencies [3760b47]
- Updated dependencies [be35b11]
  - @glissade/core@0.20.0
  - @glissade/scene@0.20.0

## 0.20.0-pre.7

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.20.0-pre.7
  - @glissade/core@0.20.0-pre.7

## 0.20.0-pre.6

### Patch Changes

- Updated dependencies [4a2117f]
  - @glissade/core@0.20.0-pre.6
  - @glissade/scene@0.20.0-pre.6

## 0.20.0-pre.5

### Patch Changes

- Updated dependencies [fd12bb8]
  - @glissade/scene@0.20.0-pre.5
  - @glissade/core@0.20.0-pre.5

## 0.20.0-pre.4

### Patch Changes

- Updated dependencies [519e1f8]
  - @glissade/scene@0.20.0-pre.4
  - @glissade/core@0.20.0-pre.4

## 0.20.0-pre.3

### Patch Changes

- Updated dependencies [2a30be9]
  - @glissade/scene@0.20.0-pre.3
  - @glissade/core@0.20.0-pre.3

## 0.20.0-pre.2

### Minor Changes

- 3760b47: 0.20: variable-font passthrough (`fontVariationSettings` → Skia rasterizer) + animation-deferred

  The 0.19.1 typed `Text.fontVariationSettings` prop was accepted-and-DROPPED (no
  rasterizer wiring). 0.20 WIRES it as **static passthrough**: the axis string
  threads `Text → FontSpec.fontVariationSettings → ctx.fontVariationSettings` and
  is applied by the rasterizer where the 2D context supports it.

  - **Skia / export path** (`@napi-rs/canvas`) exposes a settable
    `ctx.fontVariationSettings`, so the axes reach the glyphs — a heavier `"wght"`
    renders distinctly, and a mid weight no discrete named instance can reach (e.g.
    `"wght" 550`) is now expressible. The new `golden-variable-font` corpus pins
    three weights of one variable face rendering distinctly — the byte-exact proof
    the axis is applied, not dropped. The measurer applies the same axes, so
    line-breaking/box metrics match the draw.
  - **Browser** (DOM 2D canvas) has no `fontVariationSettings` property, so axes
    are **best-effort** there — a guarded no-op (never a throw), with a one-time
    dev-warning that the value wasn't applied. For perfect cross-backend parity,
    instance the face to a static sfnt at ingest (the `font-instanced` golden).

  **Default Text is byte-identical:** the axis key is OMITTED from the FontSpec
  when unset (all measure/layout/draw sites route through one `Text.fontSpec()`
  that spreads it conditionally), so the 262 pre-existing goldens stay
  byte-for-byte unchanged.

  **Animatable axes stay deferred to 1.0** (an opaque CSS string isn't
  interpolatable). `fontVariationSettings` is not a bindable target, so a timeline
  track on `<id>/fontVariationSettings` hard-throws `UnboundTargetError` — the
  loud signal for the deferred-animation case, not a silent drop. Use discrete
  `fontWeight` named instances for a weight that changes over time.

### Patch Changes

- Updated dependencies [3760b47]
- Updated dependencies [be35b11]
  - @glissade/scene@0.20.0-pre.2
  - @glissade/core@0.20.0-pre.2

## 0.20.0-pre.1

### Patch Changes

- Updated dependencies [0f5b066]
- Updated dependencies [1bd4507]
  - @glissade/scene@0.20.0-pre.1
  - @glissade/core@0.20.0-pre.1

## 0.20.0-pre.0

### Patch Changes

- Updated dependencies [c629b51]
  - @glissade/core@0.20.0-pre.0
  - @glissade/scene@0.20.0-pre.0

## 0.19.1

### Patch Changes

- Updated dependencies [9fc4e90]
- Updated dependencies [2f9e213]
  - @glissade/scene@0.19.1
  - @glissade/core@0.19.1

## 0.19.0

### Patch Changes

- Updated dependencies [6124d7f]
- Updated dependencies [bf0d4e8]
- Updated dependencies [56eb184]
- Updated dependencies [fc58403]
- Updated dependencies [02968bd]
  - @glissade/scene@0.19.0
  - @glissade/core@0.19.0

## 0.19.0-pre.5

### Patch Changes

- Updated dependencies [02968bd]
  - @glissade/scene@0.19.0-pre.5
  - @glissade/core@0.19.0-pre.5

## 0.19.0-pre.4

### Patch Changes

- @glissade/core@0.19.0-pre.4
- @glissade/scene@0.19.0-pre.4

## 0.19.0-pre.3

### Patch Changes

- Updated dependencies [fc58403]
  - @glissade/scene@0.19.0-pre.3
  - @glissade/core@0.19.0-pre.3

## 0.19.0-pre.2

### Patch Changes

- @glissade/core@0.19.0-pre.2
- @glissade/scene@0.19.0-pre.2

## 0.19.0-pre.1

### Patch Changes

- Updated dependencies [56eb184]
  - @glissade/scene@0.19.0-pre.1
  - @glissade/core@0.19.0-pre.1

## 0.19.0-pre.0

### Patch Changes

- Updated dependencies [6124d7f]
- Updated dependencies [bf0d4e8]
  - @glissade/scene@0.19.0-pre.0
  - @glissade/core@0.19.0-pre.0

## 0.18.0

### Patch Changes

- Updated dependencies [746b3d0]
- Updated dependencies [3dc7adb]
- Updated dependencies [0a8967c]
- Updated dependencies [7f815f9]
- Updated dependencies [0a8967c]
- Updated dependencies [d3d9206]
- Updated dependencies [8b88d27]
- Updated dependencies [35968a1]
- Updated dependencies [e3a2f6a]
  - @glissade/core@0.18.0
  - @glissade/scene@0.18.0

## 0.18.0-pre.6

### Patch Changes

- Updated dependencies [3dc7adb]
  - @glissade/scene@0.18.0-pre.6
  - @glissade/core@0.18.0-pre.6

## 0.18.0-pre.5

### Patch Changes

- Updated dependencies [746b3d0]
  - @glissade/core@0.18.0-pre.5
  - @glissade/scene@0.18.0-pre.5

## 0.18.0-pre.4

### Patch Changes

- Updated dependencies [0a8967c]
- Updated dependencies [0a8967c]
- Updated dependencies [35968a1]
  - @glissade/core@0.18.0-pre.4
  - @glissade/scene@0.18.0-pre.4

## 0.18.0-pre.3

### Patch Changes

- Updated dependencies [7f815f9]
  - @glissade/core@0.18.0-pre.3
  - @glissade/scene@0.18.0-pre.3

## 0.18.0-pre.2

### Patch Changes

- Updated dependencies [8b88d27]
  - @glissade/scene@0.18.0-pre.2
  - @glissade/core@0.18.0-pre.2

## 0.18.0-pre.1

### Patch Changes

- Updated dependencies [d3d9206]
  - @glissade/core@0.18.0-pre.1
  - @glissade/scene@0.18.0-pre.1

## 0.18.0-pre.0

### Patch Changes

- Updated dependencies [e3a2f6a]
  - @glissade/core@0.18.0-pre.0
  - @glissade/scene@0.18.0-pre.0

## 0.17.1

### Patch Changes

- Updated dependencies [3731dd4]
  - @glissade/scene@0.17.1
  - @glissade/core@0.17.1

## 0.17.1-pre.0

### Patch Changes

- Updated dependencies [3731dd4]
  - @glissade/scene@0.17.1-pre.0
  - @glissade/core@0.17.1-pre.0

## 0.17.0

### Patch Changes

- @glissade/core@0.17.0
- @glissade/scene@0.17.0

## 0.17.0-pre.0

### Patch Changes

- @glissade/core@0.17.0-pre.0
- @glissade/scene@0.17.0-pre.0

## 0.16.0

### Patch Changes

- @glissade/core@0.16.0
- @glissade/scene@0.16.0

## 0.16.0-pre.1

### Patch Changes

- @glissade/core@0.16.0-pre.1
- @glissade/scene@0.16.0-pre.1

## 0.16.0-pre.0

### Patch Changes

- @glissade/core@0.16.0-pre.0
- @glissade/scene@0.16.0-pre.0

## 0.15.0

### Patch Changes

- Updated dependencies [c87e88b]
- Updated dependencies [53030d0]
  - @glissade/core@0.15.0
  - @glissade/scene@0.15.0

## 0.15.0-pre.1

### Patch Changes

- @glissade/core@0.15.0-pre.1
- @glissade/scene@0.15.0-pre.1

## 0.15.0-pre.0

### Patch Changes

- Updated dependencies [c87e88b]
- Updated dependencies [53030d0]
  - @glissade/core@0.15.0-pre.0
  - @glissade/scene@0.15.0-pre.0

## 0.14.0

### Patch Changes

- Updated dependencies [f13486d]
- Updated dependencies [3281514]
- Updated dependencies [1795d1c]
- Updated dependencies [7456761]
  - @glissade/core@0.14.0
  - @glissade/scene@0.14.0

## 0.14.0-pre.1

### Patch Changes

- Updated dependencies [f13486d]
  - @glissade/core@0.14.0-pre.1
  - @glissade/scene@0.14.0-pre.1

## 0.14.0-pre.0

### Patch Changes

- Updated dependencies [3281514]
- Updated dependencies [1795d1c]
- Updated dependencies [7456761]
  - @glissade/scene@0.14.0-pre.0
  - @glissade/core@0.14.0-pre.0

## 0.13.0

### Patch Changes

- Updated dependencies [d1e81b7]
- Updated dependencies [d1e81b7]
- Updated dependencies [1995ee8]
- Updated dependencies [707d228]
- Updated dependencies [88ba5bc]
- Updated dependencies [750367f]
- Updated dependencies [3bc3270]
- Updated dependencies [993d46a]
- Updated dependencies [8bec181]
- Updated dependencies [0a3d35b]
  - @glissade/core@0.13.0
  - @glissade/scene@0.13.0

## 0.13.0-pre.3

### Patch Changes

- Updated dependencies [0a3d35b]
  - @glissade/core@0.13.0-pre.3
  - @glissade/scene@0.13.0-pre.3

## 0.13.0-pre.2

### Patch Changes

- Updated dependencies [8bec181]
  - @glissade/core@0.13.0-pre.2
  - @glissade/scene@0.13.0-pre.2

## 0.13.0-pre.1

### Patch Changes

- Updated dependencies [d1e81b7]
- Updated dependencies [d1e81b7]
  - @glissade/core@0.13.0-pre.1
  - @glissade/scene@0.13.0-pre.1

## 0.13.0-pre.0

### Patch Changes

- Updated dependencies [1995ee8]
- Updated dependencies [707d228]
- Updated dependencies [88ba5bc]
- Updated dependencies [750367f]
- Updated dependencies [3bc3270]
- Updated dependencies [993d46a]
  - @glissade/core@0.13.0-pre.0
  - @glissade/scene@0.13.0-pre.0

## 0.12.1

### Patch Changes

- Updated dependencies [56fa1f3]
  - @glissade/core@0.12.1
  - @glissade/scene@0.12.1

## 0.12.0

### Minor Changes

- e41e9f0: feat(render): persistent whole-frame raster cache (`.gscache`) — content-addressed disk cache (§3.5)

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

### Patch Changes

- Updated dependencies [78393f1]
- Updated dependencies [2850386]
- Updated dependencies [796b568]
- Updated dependencies [388a8f0]
- Updated dependencies [47a3ca0]
- Updated dependencies [2a520c5]
  - @glissade/core@0.12.0
  - @glissade/scene@0.12.0

## 0.12.0-pre.1

### Patch Changes

- Updated dependencies [78393f1]
  - @glissade/core@0.12.0-pre.1
  - @glissade/scene@0.12.0-pre.1

## 0.12.0-pre.0

### Minor Changes

- e41e9f0: feat(render): persistent whole-frame raster cache (`.gscache`) — content-addressed disk cache (§3.5)

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

### Patch Changes

- Updated dependencies [2850386]
- Updated dependencies [796b568]
- Updated dependencies [388a8f0]
- Updated dependencies [47a3ca0]
- Updated dependencies [2a520c5]
  - @glissade/core@0.12.0-pre.0
  - @glissade/scene@0.12.0-pre.0

## 0.11.0

### Patch Changes

- Updated dependencies [c7c6660]
- Updated dependencies [230b7ad]
- Updated dependencies [f742c55]
  - @glissade/core@0.11.0
  - @glissade/scene@0.11.0

## 0.11.0-pre.1

### Patch Changes

- @glissade/core@0.11.0-pre.1
- @glissade/scene@0.11.0-pre.1

## 0.11.0-pre.0

### Patch Changes

- Updated dependencies [c7c6660]
- Updated dependencies [230b7ad]
- Updated dependencies [f742c55]
  - @glissade/core@0.11.0-pre.0
  - @glissade/scene@0.11.0-pre.0

## 0.10.1

### Patch Changes

- Updated dependencies [f9f7ebe]
- Updated dependencies [7482378]
  - @glissade/core@0.10.1
  - @glissade/scene@0.10.1

## 0.10.1-pre.1

### Patch Changes

- Updated dependencies [f9f7ebe]
  - @glissade/core@0.10.1-pre.1
  - @glissade/scene@0.10.1-pre.1

## 0.10.1-pre.0

### Patch Changes

- Updated dependencies [7482378]
  - @glissade/core@0.10.1-pre.0
  - @glissade/scene@0.10.1-pre.0

## 0.10.0

### Patch Changes

- Updated dependencies [fbdcc44]
- Updated dependencies [fbdcc44]
- Updated dependencies [b2f1fd7]
- Updated dependencies [278ea05]
- Updated dependencies [e4190b5]
- Updated dependencies [680f8ae]
- Updated dependencies [0cc640f]
- Updated dependencies [0a1844c]
  - @glissade/scene@0.10.0
  - @glissade/core@0.10.0

## 0.10.0-pre.1

### Patch Changes

- Updated dependencies [fbdcc44]
- Updated dependencies [fbdcc44]
  - @glissade/scene@0.10.0-pre.1
  - @glissade/core@0.10.0-pre.1

## 0.10.0-pre.0

### Patch Changes

- Updated dependencies [b2f1fd7]
- Updated dependencies [278ea05]
- Updated dependencies [680f8ae]
- Updated dependencies [0cc640f]
- Updated dependencies [0a1844c]
  - @glissade/core@0.10.0-pre.0
  - @glissade/scene@0.10.0-pre.0

## 0.9.1

### Patch Changes

- @glissade/core@0.9.1
- @glissade/scene@0.9.1

## 0.9.1-pre.0

### Patch Changes

- @glissade/core@0.9.1-pre.0
- @glissade/scene@0.9.1-pre.0

## 0.9.0

### Patch Changes

- Updated dependencies [f3b471b]
- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0
  - @glissade/scene@0.9.0

## 0.9.0-pre.1

### Patch Changes

- Updated dependencies [f3b471b]
  - @glissade/core@0.9.0-pre.1
  - @glissade/scene@0.9.0-pre.1

## 0.9.0-pre.0

### Patch Changes

- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0-pre.0
  - @glissade/scene@0.9.0-pre.0

## 0.8.1

### Patch Changes

- @glissade/core@0.8.1
- @glissade/scene@0.8.1

## 0.8.1-pre.1

### Patch Changes

- @glissade/core@0.8.1-pre.1
- @glissade/scene@0.8.1-pre.1

## 0.8.1-pre.0

### Patch Changes

- @glissade/core@0.8.1-pre.0
- @glissade/scene@0.8.1-pre.0

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

- 2282bcb: The downstream-friction batch (driven by a consuming project's 0.3.0→0.4.2 report). `createMeasurer({ fonts })` in backend-skia + `setDefaultMeasurer()` in scene bless factory-time measurement — Text pulls and un-injected scenes fall back through the process default before the estimator, so component factories measure with the rasterizer's real metrics (scene-injected measurers still win). `springTo(endT, from, to, cfg)` in core returns the [launch, settle] key pair with the spring-duration arithmetic done — settle-ON-the-beat without hand math. `Text.wordBoxes()` trims whitespace that punctuation-gluing folds into a segment (' $' → '$'), so boxes cover exactly the ink. `AudioClip.gain` accepts keys-only envelopes (`{ keys }`); the meaningless-but-mandatory target string is gone (full Tracks still work structurally). `duckEnvelope(timing, opts)` in narrate derives the music-bed ducking gain from the narration manifest (segment windows, attack/release ramps, near-window merging) — upstreamed from downstream. `gs render` progress detects non-TTY stderr and emits sparse newline-terminated updates instead of an unbroken \r stream.
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

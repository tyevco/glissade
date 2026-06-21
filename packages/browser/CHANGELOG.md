# @glissade/browser

## 0.18.0-pre.5

### Minor Changes

- 746b3d0: feat(core,scene,browser): `glissade.describe()` — a machine-readable API manifest

  `describe()` returns a structured, JSON-serializable manifest of the public API —
  the structural antidote to discoverability, so an AI consumer reads GROUND TRUTH
  from the artifact instead of reverse-engineering the surface. It is PURE
  INTROSPECTION (instantiate each built-in node once, read its registered targets,
  enumerate the core registries); zero `evaluate()`/determinism impact — every
  golden is byte-identical.

  The manifest is GENERATED from the live registries it documents, so it can't
  drift from the real API:

  - `nodes[*].props[*]` — the animatable track targets per node type, each with its
    value type + arity, read from the REAL `registerTarget` calls via the new
    `Node.listTargets()` (e.g. `position: { type:'vec2', animatable:true,
target:'<id>/position', arity:2 }`, `fill: { type:'color|paint' }`,
    `Text.reveal: { type:'number' }`).
  - `valueTypes` — from the new `listValueTypes()` over the core ValueType registry.
  - `easings` — from the core easing registry.
  - `builder` / `createScene` / `subpaths` — curated, with a test pinning the
    builder names to the live `TimelineBuilder` surface.

  `describe()` lives on the tree-shakeable `@glissade/scene/describe` subpath (off
  the base embed — base embed path unchanged), and is re-exported on the
  `@glissade/browser` bundle as `window.glissade.describe()`. The browser build also
  emits a committed `dist/glissade.api.json` (= `JSON.stringify(describe())`) so a
  tool can fetch the manifest without running JS.

### Patch Changes

- Updated dependencies [746b3d0]
  - @glissade/core@0.18.0-pre.5
  - @glissade/scene@0.18.0-pre.5
  - @glissade/backend-canvas2d@0.18.0-pre.5
  - @glissade/element@0.18.0-pre.5
  - @glissade/player@0.18.0-pre.5

## 0.18.0-pre.4

### Patch Changes

- Updated dependencies [0a8967c]
- Updated dependencies [0a8967c]
- Updated dependencies [35968a1]
  - @glissade/core@0.18.0-pre.4
  - @glissade/scene@0.18.0-pre.4
  - @glissade/backend-canvas2d@0.18.0-pre.4
  - @glissade/element@0.18.0-pre.4
  - @glissade/player@0.18.0-pre.4

## 0.18.0-pre.3

### Patch Changes

- Updated dependencies [7f815f9]
  - @glissade/core@0.18.0-pre.3
  - @glissade/backend-canvas2d@0.18.0-pre.3
  - @glissade/element@0.18.0-pre.3
  - @glissade/player@0.18.0-pre.3
  - @glissade/scene@0.18.0-pre.3

## 0.18.0-pre.2

### Patch Changes

- Updated dependencies [8b88d27]
  - @glissade/scene@0.18.0-pre.2
  - @glissade/backend-canvas2d@0.18.0-pre.2
  - @glissade/element@0.18.0-pre.2
  - @glissade/player@0.18.0-pre.2
  - @glissade/core@0.18.0-pre.2

## 0.18.0-pre.1

### Patch Changes

- Updated dependencies [d3d9206]
  - @glissade/core@0.18.0-pre.1
  - @glissade/backend-canvas2d@0.18.0-pre.1
  - @glissade/element@0.18.0-pre.1
  - @glissade/player@0.18.0-pre.1
  - @glissade/scene@0.18.0-pre.1

## 0.18.0-pre.0

### Patch Changes

- Updated dependencies [e3a2f6a]
  - @glissade/core@0.18.0-pre.0
  - @glissade/backend-canvas2d@0.18.0-pre.0
  - @glissade/element@0.18.0-pre.0
  - @glissade/player@0.18.0-pre.0
  - @glissade/scene@0.18.0-pre.0

## 0.17.1

### Patch Changes

- 3731dd4: The single-file convenience bundle now exposes the whole clip tier on `window.glissade`: `presence`, `each`, `morph`, `clip`, `clipList`, and the clip stdlib (`popIn`/`slideIn`/`pulse`/`driftLoop`). These live on the tree-shaken `@glissade/core/clips` subpath (off the core base index for the core budget), so they were missing from `window.glissade` — consumers had to reinvent `presence()`. The `@glissade/browser` entry now re-exports `@glissade/core/clips` (only the bundle, never the core base index — that would pull clips into the core/index size budget). Measured IIFE grew 39.3 → 42.3 kB gz, still within the 45 kB `browser` budget.
- Updated dependencies [3731dd4]
- Updated dependencies [3731dd4]
  - @glissade/element@0.17.1
  - @glissade/scene@0.17.1
  - @glissade/backend-canvas2d@0.17.1
  - @glissade/player@0.17.1
  - @glissade/core@0.17.1

## 0.17.1-pre.0

### Patch Changes

- 3731dd4: The single-file convenience bundle now exposes the whole clip tier on `window.glissade`: `presence`, `each`, `morph`, `clip`, `clipList`, and the clip stdlib (`popIn`/`slideIn`/`pulse`/`driftLoop`). These live on the tree-shaken `@glissade/core/clips` subpath (off the core base index for the core budget), so they were missing from `window.glissade` — consumers had to reinvent `presence()`. The `@glissade/browser` entry now re-exports `@glissade/core/clips` (only the bundle, never the core base index — that would pull clips into the core/index size budget). Measured IIFE grew 39.3 → 42.3 kB gz, still within the 45 kB `browser` budget.
- Updated dependencies [3731dd4]
- Updated dependencies [3731dd4]
  - @glissade/element@0.17.1-pre.0
  - @glissade/scene@0.17.1-pre.0
  - @glissade/backend-canvas2d@0.17.1-pre.0
  - @glissade/player@0.17.1-pre.0
  - @glissade/core@0.17.1-pre.0

## 0.17.0

### Minor Changes

- c0ffdcf: New `@glissade/browser` package: a single-file IIFE bundle of the realtime embed path (core+scene+canvas2d+player+element) for `<script src>` / no-build browser use; `window.glissade.*`, auto-registers `<gs-player>`.

### Patch Changes

- @glissade/backend-canvas2d@0.17.0
- @glissade/core@0.17.0
- @glissade/element@0.17.0
- @glissade/player@0.17.0
- @glissade/scene@0.17.0

## 0.17.0-pre.0

### Minor Changes

- c0ffdcf: New `@glissade/browser` package: a single-file IIFE bundle of the realtime embed path (core+scene+canvas2d+player+element) for `<script src>` / no-build browser use; `window.glissade.*`, auto-registers `<gs-player>`.

### Patch Changes

- @glissade/backend-canvas2d@0.17.0-pre.0
- @glissade/core@0.17.0-pre.0
- @glissade/element@0.17.0-pre.0
- @glissade/player@0.17.0-pre.0
- @glissade/scene@0.17.0-pre.0

# @glissade/browser

## 0.18.0

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

- 3dc7adb: feat(scene,browser): `describe()` construction-completeness — construction props + layout nodes + assets map + negative-space guard

  `glissade.describe()` now describes **construction + animation**, not just
  animation. Two AI-consumer canaries independently converged on the same gap: the
  pre.5 manifest listed only ANIMATABLE props (those from `registerTarget`), so an
  AI could not _construct_ a node from it (no `assetId`, no `fontFamily`, no layout
  nodes). Still PURE INTROSPECTION — every golden is byte-identical, and `describe`
  stays tree-shaken off the base embed path (base embed UNCHANGED at 38.15 kB gz).

  - **Non-animatable construction props** are now in the manifest, flagged
    `{ animatable: false }` with NO `target`:
    - Image/Video `assetId` — `{ type:'string', animatable:false, required:true }`
      (you cannot construct the node without it; the media URL lives in the
      Timeline `assets` map, keyed by this id).
    - Text `fontFamily`/`align`/`anchor` (and `fontWeight`/`fontStyle`/`lineHeight`)
      — construction-only; `fontSize`/`text`/`fill`/`width`/`reveal` stay animatable
      targets.
    - Shape `sketch`/`sketchFill`/`sketchSeed`, Video clip props
      (`at`/`trimStart`/`playbackRate`/`clipDuration`/`sourceFps`), Group/Layout
      `children`, and the shared base-`NodeProps` set (`id`/`blend`/`filters`/
      `anchor`/`cache`).
  - **Layout family** (`Layout`/`Stack`/`Row`/`Column`) are now first-class
    `.nodes` entries, each tagged with `subpath: '@glissade/scene/layout'`. Their
    `width`/`height`/`gap`/`padding` are animatable targets;
    `direction`/`justify`/`align`/`children` are construction.
  - **`createScene`** surfaces the asset manifest shape: media is declared on the
    Timeline document via `timeline({ assets: { <id>: { kind:'image'|'video', url
} } })`, and an Image/Video node's `assetId` names an entry there.
  - **`stagger`** signature shows the non-uniform form:
    `each: number | ((rank, count) => number)`.

  **Negative-space guard** (the manifest's core value — the targets it does NOT
  list): a `{ animatable:false }` prop is never a real track target. A new test
  affirmatively confirms that binding a track to a construction-only prop
  (`<id>/assetId`, `<id>/fontFamily`) is REJECTED by the bind guard, so an
  accidentally-animatable construction prop is caught. A drift guard constructs
  each node from exactly the manifest's construction props (the constructor must
  accept them) and asserts no construction prop name collides with an animatable
  target.

  The richer manifest pushed the single-file `@glissade/browser` convenience
  bundle from 44.48 → 45.09 kB gz; its budget moved 45 → 46 kB (the base embed is
  unaffected — `describe` is not on it).

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
  - @glissade/backend-canvas2d@0.18.0
  - @glissade/element@0.18.0
  - @glissade/player@0.18.0

## 0.18.0-pre.6

### Minor Changes

- 3dc7adb: feat(scene,browser): `describe()` construction-completeness — construction props + layout nodes + assets map + negative-space guard

  `glissade.describe()` now describes **construction + animation**, not just
  animation. Two AI-consumer canaries independently converged on the same gap: the
  pre.5 manifest listed only ANIMATABLE props (those from `registerTarget`), so an
  AI could not _construct_ a node from it (no `assetId`, no `fontFamily`, no layout
  nodes). Still PURE INTROSPECTION — every golden is byte-identical, and `describe`
  stays tree-shaken off the base embed path (base embed UNCHANGED at 38.15 kB gz).

  - **Non-animatable construction props** are now in the manifest, flagged
    `{ animatable: false }` with NO `target`:
    - Image/Video `assetId` — `{ type:'string', animatable:false, required:true }`
      (you cannot construct the node without it; the media URL lives in the
      Timeline `assets` map, keyed by this id).
    - Text `fontFamily`/`align`/`anchor` (and `fontWeight`/`fontStyle`/`lineHeight`)
      — construction-only; `fontSize`/`text`/`fill`/`width`/`reveal` stay animatable
      targets.
    - Shape `sketch`/`sketchFill`/`sketchSeed`, Video clip props
      (`at`/`trimStart`/`playbackRate`/`clipDuration`/`sourceFps`), Group/Layout
      `children`, and the shared base-`NodeProps` set (`id`/`blend`/`filters`/
      `anchor`/`cache`).
  - **Layout family** (`Layout`/`Stack`/`Row`/`Column`) are now first-class
    `.nodes` entries, each tagged with `subpath: '@glissade/scene/layout'`. Their
    `width`/`height`/`gap`/`padding` are animatable targets;
    `direction`/`justify`/`align`/`children` are construction.
  - **`createScene`** surfaces the asset manifest shape: media is declared on the
    Timeline document via `timeline({ assets: { <id>: { kind:'image'|'video', url
} } })`, and an Image/Video node's `assetId` names an entry there.
  - **`stagger`** signature shows the non-uniform form:
    `each: number | ((rank, count) => number)`.

  **Negative-space guard** (the manifest's core value — the targets it does NOT
  list): a `{ animatable:false }` prop is never a real track target. A new test
  affirmatively confirms that binding a track to a construction-only prop
  (`<id>/assetId`, `<id>/fontFamily`) is REJECTED by the bind guard, so an
  accidentally-animatable construction prop is caught. A drift guard constructs
  each node from exactly the manifest's construction props (the constructor must
  accept them) and asserts no construction prop name collides with an animatable
  target.

  The richer manifest pushed the single-file `@glissade/browser` convenience
  bundle from 44.48 → 45.09 kB gz; its budget moved 45 → 46 kB (the base embed is
  unaffected — `describe` is not on it).

### Patch Changes

- Updated dependencies [3dc7adb]
  - @glissade/scene@0.18.0-pre.6
  - @glissade/backend-canvas2d@0.18.0-pre.6
  - @glissade/element@0.18.0-pre.6
  - @glissade/player@0.18.0-pre.6
  - @glissade/core@0.18.0-pre.6

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

# @glissade/browser

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

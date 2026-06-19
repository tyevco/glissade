# @glissade/svg

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

### Minor Changes

- c5dbc0e: New `@glissade/svg` package: static SVG import. `importSvg(svgString)` parses an SVG document into a glissade scene — `<path d>` strings (full M/L/H/V/C/S/Q/T/A/Z command set, with arcs converted to native ellipse-arc segments), the basic shapes (`rect`/`circle`/`ellipse`/`line`/`polyline`/`polygon`), `<g>` grouping, `transform` (translate/scale/rotate/matrix → node TRS), and fill/stroke/stroke-width with SVG presentation inheritance. Unsupported features (text, images, gradients, filters, masks) are dropped with warnings. Returns `{ size, root, warnings, toSceneModule() }`.

  `gs import` now accepts `.svg` alongside `.json`: it emits a scene module that defers to `importSvg` (the conversion's single source of truth), renderable by `gs render`.

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

### Minor Changes

- c5dbc0e: New `@glissade/svg` package: static SVG import. `importSvg(svgString)` parses an SVG document into a glissade scene — `<path d>` strings (full M/L/H/V/C/S/Q/T/A/Z command set, with arcs converted to native ellipse-arc segments), the basic shapes (`rect`/`circle`/`ellipse`/`line`/`polyline`/`polygon`), `<g>` grouping, `transform` (translate/scale/rotate/matrix → node TRS), and fill/stroke/stroke-width with SVG presentation inheritance. Unsupported features (text, images, gradients, filters, masks) are dropped with warnings. Returns `{ size, root, warnings, toSceneModule() }`.

  `gs import` now accepts `.svg` alongside `.json`: it emits a scene module that defers to `importSvg` (the conversion's single source of truth), renderable by `gs render`.

### Patch Changes

- Updated dependencies [6c07c96]
- Updated dependencies [977b3d5]
  - @glissade/core@0.6.0-pre.1
  - @glissade/scene@0.6.0-pre.1

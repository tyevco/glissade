---
'@glissade/svg': minor
'@glissade/cli': minor
---

New `@glissade/svg` package: static SVG import. `importSvg(svgString)` parses an SVG document into a glissade scene — `<path d>` strings (full M/L/H/V/C/S/Q/T/A/Z command set, with arcs converted to native ellipse-arc segments), the basic shapes (`rect`/`circle`/`ellipse`/`line`/`polyline`/`polygon`), `<g>` grouping, `transform` (translate/scale/rotate/matrix → node TRS), and fill/stroke/stroke-width with SVG presentation inheritance. Unsupported features (text, images, gradients, filters, masks) are dropped with warnings. Returns `{ size, root, warnings, toSceneModule() }`.

`gs import` now accepts `.svg` alongside `.json`: it emits a scene module that defers to `importSvg` (the conversion's single source of truth), renderable by `gs render`.

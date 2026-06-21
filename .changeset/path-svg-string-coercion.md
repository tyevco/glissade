---
'@glissade/scene': patch
---

`Path.data` now throws a clear construction-time error on a string (was a render-time crash — `TypeError … s.v.length`, the contour walk dereferencing `.v` on a string char): `Path.data expects PathValue (PathContour[]); for an SVG path 'd' string, parse it with pathFromSvg(d) from "@glissade/scene/path" (or window.glissade.pathFromSvg in the browser bundle)`.

SVG `d` strings parse via the new `pathFromSvg` / `parseSvgPathData` on the **tree-shakeable `@glissade/scene/path` subpath** (mirrors `@glissade/scene/layout`), kept OFF the base scene index — and thus off the base embed path. An embed that never parses an SVG string no longer pays for the parser, bringing the base embed comfortably back under the 38 kB budget. `pathFromSvg(d)` = `pathFromSegs(parseSvgPathData(d))`; use it then build the node: `new Path({ data: pathFromSvg('M0 0 …') })`. The lean parser still covers `M/L/H/V/C/Q/Z` (absolute + relative) with no `@glissade/svg` dependency. The single-file `@glissade/browser` bundle re-exports the subpath, so `window.glissade.pathFromSvg` / `window.glissade.parseSvgPathData` are present there. Existing `PathContour[]` `data` is unchanged.

---
'@glissade/scene': patch
---

`Path({ data })` now accepts a raw SVG `d` STRING (parsed at construction to a `PathValue` via a lean in-package `M/L/H/V/C/Q/Z` parser — no `@glissade/svg` dependency, so the enforced dependency direction is preserved). Previously a `d` string built fine but threw `TypeError … s.v.length` at render because the contour walk dereferenced `.v` on a string char. A non-string, non-`PathValue` `data` (e.g. a number) now throws a clear construction-time error (`Path.data expects PathValue (PathContour[]) or an SVG path string; got <type>`) instead of crashing at render. Existing `PathContour[]` `data` is unchanged. Exposes `parseSvgPathData` and `coercePathData`.

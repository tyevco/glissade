---
'@glissade/scene': minor
---

`pathFromSegs(segs): PathValue` — the inverse of `Path.pathSegs`, so geometry from `roundedRectSegs`, `sketchStrokes`, or `flatten` can be placed on a `Path` node (to morph it, follow it with a motion path, or draw it on). C/Q become an anchor + relative in/out tangents (Q is promoted to cubic), L is a zero-tangent vertex, E samples to vertices, and Z closes the contour — round-tripping cubic contours exactly. Closes the biggest friction in the sketch → render path.

---
'@glissade/scene': minor
---

Hand-drawn **sketch styles** — give any shape a marker / crayon / pencil / ink / chalk look via geometric roughening (not raster textures). `ShapeProps.sketch: SketchStyle` flattens the outline and redraws each segment as a jittered, bowed, multi-pass stroke; the solid `fill` (if any) renders underneath. Works on Rect, Circle, and Path (the Circle/rounded-rect 'E' arcs flatten correctly). Seeded by `sketchSeed` (default a stable hash of the node id) and consumed fresh each draw, so it's deterministic and byte-identical on both backends — golden-covered. Invalid styles throw at construction (`validateSketch`). The pure helpers `roughen`, `flatten`, and `arcLength` are exported. (Distinct from `highlight()`'s marker *highlight* — this is the marker *stroke style*.)

---
'@glissade/scene': minor
---

Hachure fill for sketched shapes — `ShapeProps.sketchFill: HachureSpec { angleRad, gap, roughness? }` lays sketchy parallel hatch lines clipped to the shape (the pencil/crayon "filled" look), under the roughened outline. Pure path math (`hachureLines` exported), seeded from the same `sketchSeed` stream (consumed after the outline, so it's deterministic and byte-stable on both backends). Requires a `sketch` style on the shape.

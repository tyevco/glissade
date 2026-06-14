---
'@glissade/scene': minor
---

Sketch **draw-on**: a sketched shape can stroke ITSELF on via `ShapeProps.reveal` (0..1, track `<id>/reveal`, default 1 = whole). It's implemented as a retreating per-contour dash (`dash = [len, len]`, `dashOffset = len * (1 - reveal)`, `len` from `arcLength`), so the hand-drawn outline draws in. Reveal ≥ 1 takes the original byte-identical path, so existing sketched shapes are unchanged. Precise for single-contour shapes; multi-contour shapes reveal each contour in parallel. Pure of `reveal` and deterministic. (Relies on the raster2d `dashOffset` fix; hachure fill remains a follow-up.)

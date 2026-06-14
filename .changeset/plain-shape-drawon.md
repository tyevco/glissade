---
'@glissade/scene': minor
---

`reveal` draw-on now works on ANY stroked shape, not just sketched ones. A plain `Path`/`Rect`/`Circle` with a stroke and `reveal < 1` (track `<id>/reveal`) strokes itself on via a per-contour retreating dash — the satisfying hand-drawing-itself effect for plain geometry (pair with `pathFromSegs` to draw on a sketched outline). `reveal >= 1` (the default) keeps the single un-dashed stroke, so existing scenes are byte-identical.

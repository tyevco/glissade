---
'@glissade/scene': patch
---

The raster2d interpreter now honors `StrokeStyle.dashOffset` (declared but previously dropped): it sets `ctx.lineDashOffset` inside the existing dash guard and resets it, so dashed strokes can be phase-shifted. Byte-neutral for non-dashed strokes (the only path that runs it). Unblocks draw-on / stroke-reveal via a retreating dash.

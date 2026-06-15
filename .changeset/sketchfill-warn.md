---
'@glissade/scene': patch
---

`Shape` now emits a dev-mode warning when `sketchFill` is set without a `sketch` style — hachure fill is drawn only by the sketch renderer, so `sketchFill` alone was silently ignored. Dev-only (no DisplayList change); consumer-reported papercut.

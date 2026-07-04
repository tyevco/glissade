---
'@glissade/scene': patch
---

Lottie export: MotionBlur and Echo now WARN (never-silent) that their render-only effect isn't exported.

`MotionBlur` (analog-shutter smear) and `Echo` (ghost trails) are `Group` subclasses whose effect is a draw-time re-evaluation, not child nodes or tracks — so the exporter emits the base shape faithfully but the effect has no Lottie representation. Previously this was a SILENT drop (the round-trip showed the un-blurred / un-trailed shape with no warning). Now each warns once, matching its siblings (camera-shake / mesh-anim / variable-font-axes):

- `motionBlur (analog-shutter smear) is render-only — NOT exported to Lottie (the round-trip shows the un-blurred shape)`
- `echo trails are render-only — NOT exported to Lottie (only the base shape exports, no ghost copies)`

Caught by the interchange warn-audit. Export-side only — render untouched, goldens byte-identical, off the base embed, determinism unchanged.

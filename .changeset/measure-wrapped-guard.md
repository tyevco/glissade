---
'@glissade/scene': patch
---

scene: `measureWrappedText` now fails loud on a missing/invalid `font.size`

A `font.size` that wasn't a positive number made `height` `NaN` (which serializes to `null`) and `ascent`/`descent` `0` — a silent wrong result. The common cause is the field name: the `FontSpec` field is **`size`**, not `fontSize` (that's the Text node prop). `measureWrappedText` now throws an actionable error in that case instead of returning garbage.

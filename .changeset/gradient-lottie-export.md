---
"@glissade/lottie": minor
"@glissade/core": minor
---

Gradient paint export to Lottie (`gf`), with a matching importer so gradients round-trip.

`exportLottie` now emits linear (`t:1`) and radial (`t:2`) gradient fills — geometry mapped in node-local space (linear `s=from`/`e=to`, radial `s=center`/`e=center+[radius,0]`; omitted → path bounds), stops flattened to Lottie's `g.p`/`g.k` form with appended opacity stops when any stop is translucent, animated paint tracks keyframed (or per-frame-sampled for non-invertible eases). The importer parses `gf` back to a `Paint` (audit accepts it; `PathSpec.fill` widened to `string | Paint`), so the export→import→render round-trip is SSIM-gated. Mesh gradients still warn-drop (raster fallback deferred).

Adds a determinism-safe `paintType.validate` core hook (`ValueType.validate?`, called per-key in `validateTrack`) that fail-louds on a malformed paint keyframe (unknown/missing kind, empty stops/points) — additive, goldens byte-identical.

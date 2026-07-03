---
"@glissade/lottie": patch
---

`gs export --lottie` pre.1 — coalesce multi-`track()` channels (fix a latent
last-write-wins bug). The exporter grouped tracks per target with last-write-wins, so a
channel driven by more than one `track()` call (e.g. a card fading IN via one track and
OUT via another, both on `<id>/opacity`) dropped all but the last track — the fade-in
vanished and the element held full opacity from t=0 (every card leaked its entrance in
the re-imported Lottie). The exporter now runs the timeline through `compileTimeline`
first, whose coalescing is the exact same merge `evaluate()` uses — so a multi-track
channel exports the merged keyframes and the export matches what glissade renders. This
was latent since the 0.45 exporter and affects every channel (opacity/position/scale/
fill), not just group opacity. Single-track exports are byte-identical (coalesce of one
track is that track).

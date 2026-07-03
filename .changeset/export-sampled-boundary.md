---
"@glissade/lottie": patch
---

`gs export --lottie` pre.2 — anchor the document boundaries of sampled channels (fix a
dormant-window ghost). A group or leaf that fades in via a SAMPLED channel (spring /
named ease / expr, whose first key sits at a fractional frame time) sampled its span
starting one frame PAST the fade start — so the true base (0) across the leading dormant
window was never emitted, and Lottie held the first ~9% sample backward to t=0, ghosting
a "hidden" element at 4–10%. The sampled paths (`combineOpacity`'s group-opacity bake,
`sampleToLottieKeys`, and the per-axis `sampleComponentVec`) now anchor their boundaries:
a HOLD keyframe at `ip` carrying the value sampled there (0 for a dormant fade — held,
not ramped, so the whole dormant window stays at the base) and a keyframe at `op` for a
fade-out's true tail. Channels whose keyed span already covers `[ip,op]` (the common
integer-keyed case) are byte-identical. Together with the pre.1 multi-track coalesce fix,
a real episode's fading elements now export hidden until their beat.

---
"@glissade/lottie": minor
"@glissade/cli": minor
---

Track → Lottie export (`gs export --lottie`): compile a scene's timeline into
Lottie/dotLottie JSON — the inverse of Lottie import. `exportLottie(sceneModule, opts)`
walks the node tree into hierarchical Lottie layers and turns each `<id>/<prop>` track
into an animated channel (position/opacity/scale/rotation, solid fill/stroke color,
`Path.d`, sampled primitive geometry). `cubicBezier`/hold easings invert exactly to
Lottie handles; named easings, springs, and `Expr` tracks are baked to dense sampled
keyframes. Text, gradient/mesh paint, shaders, non-center anchors, and group-opacity
compositing are warned-and-dropped in this MVP. Verified by an in-process
export→import→Skia SSIM round-trip gate. Additive and off the embed path — no scene/core
change, determinism and goldens unaffected.

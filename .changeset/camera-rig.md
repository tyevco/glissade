---
"@glissade/scene": minor
"@glissade/core": minor
---

Camera rig — cinematic push-in / pan / zoom / roll + parallax + handheld shake.

New `camera(layers, { center, zoom, roll, shake })` (a `Camera` Group subclass on the tree-shakeable `@glissade/scene/motion` subpath) wraps content and applies an inverse camera pose, so a push-in or pan moves the whole world with true perspective instead of scaling elements in isolation. `center`/`zoom`/`roll` are relative-coordinate, keyframeable signals (`cam/center`, `cam/zoom`, `cam/roll`); per-layer `depth` gives pan-only parallax (far layers move less). Captions kept as siblings *outside* the camera stay pinned by construction (the lower-third safe-area pattern). Mis-specified focal targets fail loud.

Adds `shake(node, { seed, translate, rotate, frequency })` — a standalone deterministic handheld-jitter driver usable on any node (and consumed by the camera for whole-frame shake), driven by the new pure `valueNoise(seed, t)` in core. Shake is an emit-time render effect (like `echo`/motion-blur) — deterministic and composable, but render-only (it is not a Lottie-exported track; the camera *pose* does export). Determinism preserved (`valueNoise` is a pure closed-form function of `(seed, t)`, no bake); goldens byte-identical (additive), sacred base embed unchanged (camera/shake live off-base on `/motion`).

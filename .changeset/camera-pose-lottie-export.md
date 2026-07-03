---
"@glissade/lottie": patch
---

Camera pose (and parallax) now export to Lottie instead of silently dropping.

The camera applies its pose via a render-time transform that `exportLottie` didn't read, so a camera's zoom/center/roll silently vanished on export (a push-in round-tripped to no push-in at all). `exportLottie` is now camera-aware: it samples the camera pose (`cameraLayerMatrix`) at the frame grid and emits it as the ty:3 null-parent `ks` — a static camera becomes a constant transform, an animated camera (`cam/zoom`/`cam/center`/`cam/roll` tracks) sampled keyframes — and each depth layer gets its own parented null so per-layer parallax exports too. Round-trip SSIM of a push-in recovers from ~0.87 to ≥0.98. Whole-frame camera *shake* is a render-only closed-form effect and is honestly warned (not silently dropped) rather than exported. Render path untouched — goldens byte-identical.

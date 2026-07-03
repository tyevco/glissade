---
"@glissade/lottie": patch
"@glissade/scene": patch
---

The standalone `shake(node, …)` driver now warns (instead of silently dropping) on Lottie export.

`shake()` is a closed-form render-only jitter (it wraps a node's `emit`, not a keyframe track), so it doesn't export to Lottie — the same limit camera-shake already warned about. But the *standalone* driver dropped silently. `exportLottie` now detects a shaken node (via a render-invisible marker) and emits the same honest "shake is render-only — NOT exported to Lottie" warning, once per node. No render change (goldens byte-identical); exporting the shake *motion* itself (sampled to keyframes) remains a separate follow-up.

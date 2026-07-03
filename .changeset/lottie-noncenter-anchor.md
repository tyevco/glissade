---
"@glissade/lottie": minor
---

Lottie export now honors a node's explicit anchor.

Previously `exportLottie` hard-coded the Lottie anchor point (`ks.a`) to `[0,0]`, so a non-center-anchored node — e.g. a full-canvas `anchor: 'top-left'` background — was mispositioned by half its size on export (a re-centering that dropped round-trip SSIM to ~0.28 on the common full-canvas-background idiom). `buildTransform` now emits `ks.a = drawOffset + anchor·size` (the content-space anchor point), so the exported placement matches the render exactly and the rotation/scale pivot is correct.

Gated on `node.hasAnchor` and computed from `drawOffset`/`intrinsicSize`, so center-anchored and legacy/unset-anchor nodes (and groups) stay byte-identical to before. Export-only — the importer's anchor handling was already symmetric.

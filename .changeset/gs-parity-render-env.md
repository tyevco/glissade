---
"@glissade/cli": patch
---

`gs parity` pre.1 — render through the same environment as `gs render` (fix a silent
false-PASS). The parity command's Skia reference render only set the text measurer and
evaluated — it skipped the font-face + variable-font-axis registration, Yoga layout init,
asset decode, and determinism guard that `gs render` performs. So a variable-font scene
rendered at the font's default weight on BOTH legs (the reference never registered the
face), and `gs parity` reported a false SSIM 1.0 / PASS on a real interchange loss (the
Lottie export drops `fontAxes`); Layout and media scenes errored outright. The render-env
setup is now a shared `prepareSkiaRenderEnv` helper that both `gs render` and both parity
legs use, so parity matches render by construction: a variable-font scene now correctly
surfaces the ~0.79 loss, and Layout/media scenes render instead of erroring. `gs render`
output is byte-identical (the extraction changed no render behavior).

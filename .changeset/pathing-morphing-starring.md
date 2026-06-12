---
'@glissade/core': minor
'@glissade/scene': minor
'@glissade/interact': patch
---

The `path` value type + `Path` node (Lottie S0). `PathValue` is bezier contours in vertex form (`{closed, v, in, out}[]` — Lottie's own representation, plain JSON); morphs are pairwise lerps of anchors and tangents, exactly how lottie-web interpolates, with mismatched topology snapping (one-time dev warning) instead of interpolating garbage. `Path extends Shape` registers its geometry as the animatable `<id>/d` track target and emits cubic segments to the existing IR — zero backend work. Interact gains the §C.3 fill-rule hit test (flattened nonzero winding): a star misses in its notches, a reversed inner contour cuts a real hole. `inferValueType` sniffs `PathValue` so the builder works natively. Golden-pinned with an animated star↔blob morph; browser↔Skia parity on the paths corpus measured SSIM 1.00000.

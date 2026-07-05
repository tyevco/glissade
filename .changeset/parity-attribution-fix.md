---
'@glissade/scene': patch
---

0.61 pre.1 — parity attribution correctness + diff fail-loud (canary verify fixes):

- **`gs parity --semantic` attribution is now STRUCTURAL, not geometric.** A regionless export-drop is fused to the residual it causes by structural membership: a wrapper (motionBlur/echo/camera) absorbs its whole subtree, a driver (followPath/orientToPath/lookAt) absorbs its `.target`'s subtree, a leaf (Image/Video/Text) absorbs only itself. Id-less warns resolve by walking the node tree + type-match. Four guards keep it honest both ways: containment via subtree/target sets (never bbox), own-warn-first, unmapped residual stays UNEXPLAINED, and absorbed descendants are recorded (`detail.coalesced`). An independent unwarned residual geometrically inside a warned wrapper's extent stays UNEXPLAINED — over-absorption (a real drop going silent) is prevented; the never-silent alarm neither cries wolf nor goes silent.
- **`ANCHOR_RECENTER`** now emits for non-center-anchor mis-exports (which the exporter drops silently), instead of falling through to UNEXPLAINED.
- **Benign sub-pixel compositing** (region-mean SSIM ≥ 0.92, unwarned) → `LOTTIE_APPROXIMATE` instead of an UNEXPLAINED error; real feature drops (SSIM ≲ 0.7) stay loud.
- **`diff()` fail-loud:** calling it with a raw `Scene` instead of a `{scene, timeline}` state pair now throws a clear message naming the expected shape, not a cryptic internal WeakMap error.

Additive/pure-read: 415 goldens byte-identical, base embed unchanged (38.67/39), attribution deterministic (shuffle-stable, byte-identical run-to-run).

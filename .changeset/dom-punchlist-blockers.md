---
'@glissade/backend-dom': patch
---

backend-dom: fix three visual-parity blockers found dogfooding the editable-DOM tier

- **Rounded-Rect fill gaps (e1JP5_1IzI2D):** an `E` (arc) seg mid-contour emitted a leading `M` (moveto), breaking a rounded rect into 8 disconnected open subpaths that don't fill solid. A continuing arc now leads with `L` (only a standalone `E`, e.g. a Circle, keeps its `M`), so the contour is one continuous closed subpath — solid fill, matching canvas2d/Skia.
- **Reconciler `insertBefore` crash on structural transitions (faMEQkj0Lk0z):** `restore` pruned the *current* cursor even when no transform/clip child was entered — so a node at identity transform (`save … draw … restore` with no wrapper) pruned its **shared parent** mid-frame, dropping later siblings' elements before they re-emitted and throwing `NotFoundError` on the next insert (freezing continuous playback across movement boundaries). `restore` now prunes only a child cursor it actually entered; the parent is pruned once at end-of-render. Persisting nodes keep element identity (the S3 contract).
- **Text wrap measurement (aJsLQp0fSs5L):** the hidden measuring span could be mounted under a not-yet-connected host, which reports a 0-width rect in real browsers too — silently degrading wrapping to the coarse estimate so long captions overflow their `width`. The span now mounts in a guaranteed-live tree (document body) and re-attaches if it drifts out.

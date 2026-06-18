---
'@glissade/cli': patch
'@glissade/scene': patch
---

Docs: `gs render --workers` now notes it helps CPU-bound, per-frame-cheap scenes — a single render is already internally multi-threaded, so bandwidth-bound / blur-heavy scenes gain little from sharding. `NodeProps.cache` now documents that the cache is for a static subtree under a *moving parent* (a subtree that drifts on sub-pixel positions misses every frame), and that a `filter` is a live composite parameter never baked into the cached bitmap. (0.10 downstream validation.)

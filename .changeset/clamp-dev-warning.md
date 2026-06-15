---
'@glissade/core': patch
---

`sampleTrack` now emits a once-per-track dev warning when a non-extrapolating type (path / discrete) clamps an out-of-range eased value — e.g. a spring or overshooting ease on a `path` track gets flattened. Previously the clamp was silent, hiding a likely authoring mistake.

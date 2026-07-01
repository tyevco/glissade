---
'@glissade/scene': patch
'@glissade/core': patch
---

mesh: per-point sub-path targets now fail loud (the docstring over-promised them)

Animating a mesh point via `track('node/fill.points.0.pos', …)` never resolved — `fill` is a single signal, not a nested tree — but the `MeshPoint` docstring implied per-point sub-path tracks exist. Now: (1) the docstring documents the real mechanism (drive the WHOLE `fill` as a `paint` track; two same-point-count meshes interpolate pairwise), and (2) a `fill.points.<i>.*` target throws a SPECIFIC actionable error pointing at that whole-fill paint track, instead of the generic "no property signal resolves to it".

---
'@glissade/scene': minor
---

Motion along a path: drive a node along a `Path`'s geometry over time. `followPath(target, path, { progress, orient, orientOffset })` is a companion node that owns the target's `position` (and `rotation`, when `orient`) and binds them — pull-based, no eval-order side effect — to its own animatable `progress` (0→1, track `<id>/progress`). Travel is **arc-length parameterized** (constant speed, not bunched at control points), and `orient` rotates the target to the path tangent (degrees) so a cursor or arrow points where it's heading.

The pure sampler is exported too: `motionPath(path)` → `{ length, at(s), tangentAt(s), atProgress(u), tangentAtProgress(u) }`, plus `pointAtLength(path, s)` / `pathLength(path)`. Deterministic (static table built once, pure of progress) and in the golden corpus. v1 snapshots a static `PathValue` (pass a `Path` node's `data()`); morphing-path follow is a follow-up.

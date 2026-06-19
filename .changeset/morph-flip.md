---
'@glissade/core': minor
---

Add `morph()` (on the `@glissade/core/clips` sub-path) — a shared-element box-FLIP morph. Given two caller-supplied `Box` literals (a from and a to rect, Rect center convention) and a `{ morphNode, fromNode?, toNode? }` target map, it compiles a FLIP position+scale tween on one shared element plus an optional opacity cross-fade. Pure core (no scene/Yoga query): the FLIP delta is plain arithmetic over the two boxes, emitted through the validated `clip` path so the tracks are byte-indistinguishable from hand-authored ones. Degenerate boxes, non-positive duration, and out-of-range crossfade are rejected at build time.

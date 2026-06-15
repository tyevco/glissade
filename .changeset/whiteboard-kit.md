---
'@glissade/scene': minor
---

Whiteboard kit: **`drawOn(target, opts)`** builds a `<id>/reveal` track running 0→1, so a stroked or sketched shape hand-draws itself on in one call; **`drawOnEach(targets, opts)`** cascades a list of shapes drawing on one after another (the classic whiteboard sequence) by staggering their reveal tracks. Composes the sketch `reveal` draw-on with the core `stagger` helper.

---
'@glissade/scene': minor
---

New `auditCacheCold(createScene, doc, t)` DEV harness (§2.1/§5.5): evaluates two fresh scenes from the same factory at the same `t` — the coldest possible re-eval, which (unlike merely clearing the binding cache) also defeats a signal cache that doesn't depend on the playhead — and confirms the DisplayLists are byte-identical. On a mismatch it returns the id of the first node whose isolated `emit()` diverged (preferring the specific leaf over its container Group), so an impure node (wall clock, unseeded random, cross-frame state) is named rather than silently degrading the render. The runtime complement to the static eslint rules and the render-mode guards.

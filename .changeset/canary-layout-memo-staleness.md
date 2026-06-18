---
'@glissade/scene': patch
---

The `computed()`-backed Layout memo now re-runs on the two structural inputs it previously missed: a child add/remove (`Group` gains a tracked structural version, plus a reactive `Group.remove()`) and a scene `TextMeasurer` swap (the scene measurer is now a signal). Previously an auto-sized Layout could return a stale size after a child was added/removed or after a measurer was swapped (e.g. post-webfont-load) on an already-primed memo. Fixed-tree rendering and goldens are unchanged.

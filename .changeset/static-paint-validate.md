---
"@glissade/scene": patch
---

Fail loud on a malformed **static** Paint fill at node construction — the common gradient-authoring path (`new Rect({ fill: { kind: 'radialgradient', … } })`). Previously `paintType.validate` was wired only into animated tracks (`validateTrack`), so a typo'd static fill bypassed it and failed cryptically and inconsistently per backend (canvas2d `"s is not iterable"`, Skia shader failure, DOM silently rendering wrong). Now a static Paint literal is validated at construction and all three backends inherit one clean `PaintError`. Valid gradients, color strings, and `() => Paint` bindings are unaffected (goldens byte-identical).

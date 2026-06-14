---
'@glissade/scene': patch
---

`typewriter()` gains `opts.gap` — a default pause inserted between consecutive edit steps (default 0 = unchanged). It's dead time, excluded from either adjacent `StepMark`'s start/end (so a counter riding `steps[i].end` is unaffected), and composes with explicit per-step `{ hold }`.

---
'@glissade/scene': minor
---

`typewriter()` now returns `steps: StepMark[]` — one `{ index, start, end, value }` per edit step, the phrase boundaries of the performance. Drive sibling UI (an attempts counter, a progress dot) off `steps[i].end` instead of recomputing wall-clock spans against the edit script.

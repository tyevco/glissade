---
'@glissade/scene': patch
---

Ratify the pre-measure text-layout design: promote the 0.5px measurement
quantum to a single named export `MEASURE_QUANTUM_PX` and route `quantize`
through it. Scene-owned code quantizes advances once to this grid and hands
Yoga frozen integers; a Yoga `setMeasureFunc` was considered and rejected
(it reintroduces wasm-owned measure-mode line-breaking for no determinism
gain). Pure refactor — byte-identical rounding, goldens unchanged.

---
'@glissade/core': patch
---

Pin the custom-ease numeric derivative fallback step to `h = 1/1024` (§B.5). Eases lacking a closed-form derivative now read velocity via a spec-fixed symmetric-difference step, so interruption handoffs are reproducible across JS engines instead of depending on an arbitrary `1e-5`.

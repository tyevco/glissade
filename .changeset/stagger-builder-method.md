---
'@glissade/core': minor
---

feat(core): `tl.stagger` builder method — pure build-time sugar over `to`/`fromTo`

`stagger(targets, { to, from?, duration?, ease? }, { each, from?, at? })` loops the
shipped `to`/`fromTo` key-emission across `targets`, cascading each by a per-rank delay.
The emitted keys are byte-identical to N hand-authored offset tweens, so all existing
goldens stay byte-identical (new opt-in method, default behavior unchanged).

The `from` anchor ranks targets over their array index `i` (n = targets.length,
c = (n-1)/2), GSAP parity: `'start'` → `i`; `'end'` → `(n-1)-i`; `'center'` →
`round(|i-c|)`; `'edges'` → `round(c-|i-c|)`; numeric `k` → `round(|i-k|)`. Delay
`d_i = rank_i * each`, inserted at `base + d_i` where `base = resolvePosition(at)`
(default = chain end). After the loop the cursor reads the whole group as one block to
a following `'<'`/`'>'`/`'+='` step. `each` is number-only in v1. `StaggerSpec` and
`StaggerOpts` are re-exported from `@glissade/core`.

---
'@glissade/scene': patch
---

0.19: fix `splitText()` part drift when no real text measurer is available
(o_aLYFFPjFDf). `splitText` snapshots part geometry at build time; with no
backend measurer injected (split before `setTextMeasurer`, no `{ measurer }`
passed) it fell back to a rough per-character estimate whose error accumulates
left-to-right — so a consumer who split before wiring the backend got visibly
drifted parts, silently.

`splitText` (and the `Text.wordBoxes`/`graphemeBoxes`/`lineBoxes` it builds on)
now emit a one-shot dev-warning when they resolve to the estimating fallback,
naming the fix: pass `{ measurer: backend }` or split after `setTextMeasurer()`/
`setDefaultMeasurer()`. The estimate is no longer silent. No behavior change when
a real measurer is in play — exact layout was always available, this surfaces the
footgun and documents the contract.

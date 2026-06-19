---
'@glissade/scene': patch
---

displayDiff: the shared collapse-replacer now maps `NaN`/`Infinity`/`-Infinity`
to DISTINCT string sentinels instead of letting `JSON.stringify` collapse all
three to `null`. Two DisplayLists differing only in WHICH non-finite value
reaches a draw field previously collided the §3.5 raster cacheKey (stale raster
+ a `cacheColdAudit` false-OK); they are now distinguished. FINITE-number
serialization is byte-identical — the pinned cacheKey is unchanged.

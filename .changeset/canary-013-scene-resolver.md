---
'@glissade/scene': patch
---

0.13 canary fix: the scene `resolveTarget` now disambiguates a track target's node id from its prop path by the LONGEST REGISTERED NODE-ID PREFIX, rather than splitting on the last (or first) `/`. Both an `each()` clone id (`card/3`) and a `TokenHighlight` range prop path (`money/fill`) carry slashes, so any fixed split mis-resolved one of them: a last-slash split threw `UnboundTargetError` on a normal mount binding a `TokenHighlight` range prop (`hl/money/fill` → nonexistent node `hl/money`), while a first-slash split silently animated the wrong node. The resolver now walks slash boundaries from the longest candidate node id down, binding the first prefix that is an actually-registered node and treating the remainder as the prop path. `card/3/opacity` → node `card/3` + prop `opacity`; `hl/money/fill` → node `hl` + prop `money/fill`.

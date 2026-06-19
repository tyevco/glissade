---
'@glissade/core': minor
---

Add `presence()` (0.13) — enter/exit presence scheduling on the `@glissade/core/clips` subpath. Build-time sugar over `clip`: schedules a node's enter on `show`, back-times its exit to land exactly on `hide`, and authors a real `<nodeId>/opacity` window-guard track that culls the node (opacity<=0) outside `[show, hide]`. The enter/exit clips' own opacity keys are reconciled into the guard with the builder's deterministic later-wins coincident-key dedup (no double-authored keys); a clip without an opacity channel synthesizes the 0→1 rise / 1→0 fall. Compiles entirely to keyed `Track[]` via `track()` — byte-indistinguishable from hand-authored, with no runtime visibility flag. Returns `{ tracks, end, shownAt, hiddenAt }` so siblings anchor to the real exit. Overlapping windows throw `PresenceError`.

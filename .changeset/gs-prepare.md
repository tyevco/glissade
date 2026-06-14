---
'@glissade/cli': minor
---

`gs prepare <scene>` — one command to materialize ALL of a scene's committed audio assets: it runs the narration prepare (if a `.narration.json` sibling exists), the sfx prepare (if a `.sfx.json` exists, anchors resolving against the narration timing), and then **imports the scene module** so any in-code sfx caches the author writes at module/timeline-build time (e.g. `renderSfxAssets` for `keystrokeClips`) are flushed too. It never calls `evaluate()` (a pure read that writes nothing); the import side-effects are the flush. A missing sibling or a failing import is a skip/warning, not an abort — so prepare is a no-op-friendly superset of `gs narrate` + `gs sfx`. After it, `gs render` is a pure read of committed files.

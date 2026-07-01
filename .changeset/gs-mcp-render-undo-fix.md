---
"@glissade/cli": patch
---

`gs mcp`: fix `render_frame` staleness after `undo` returns the sidecar to baseline

`render_frame` reused one scene instance across calls. `evaluate` binds the current merged timeline's tracks but does not unbind a track that was present in a prior evaluate and absent now — so undoing the last edit (sidecar back to empty) left the removed track's stale binding on the reused scene, and `render_frame` kept rendering the pre-undo frame even though `get_timeline` correctly reverted. `render_frame` now builds a fresh scene per call (stateless, like `gs render` per run), so it's a pure function of the current merged timeline + t. Found independently by two canary seats; a regression test (apply → render → undo → render == baseline byte-identical) is added.

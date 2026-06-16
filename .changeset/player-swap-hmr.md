---
'@glissade/player': minor
---

Hot-swap a live embed (vite HMR, §4.3). `Player.swap({ duration, markers, targets })` rebinds to a recompiled timeline **preserving the current playhead** (clamped to the new duration — no replay-to-frame); playing state and registered marker/cue callbacks survive. `Mounted.swap({ scene?, timeline })` recompiles, rebinds the player, and repaints at the held time — a track whose target the new scene dropped simply stops being written (it keeps its last value rather than erroring). `swapOnHmr(mounted, initialTimeline, rerun)` returns the `import.meta.hot.accept` callback that wires a scene-module edit to a swap and warns when an edit removes a label.

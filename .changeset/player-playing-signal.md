---
'@glissade/player': minor
'@glissade/react': patch
---

`Player` gains a reactive `playingSignal: ReadonlySignal<boolean>` that invalidates on every play/pause/settle transition. React's `usePlayerState` now tracks it, so a custom play/pause UI (e.g. `<ScenePlayer controls>`) updates its button/label on pause — previously it read a non-reactive getter and only re-rendered on playhead motion, so the label went stale after pausing. (0.11 canary fix.)

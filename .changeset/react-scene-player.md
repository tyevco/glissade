---
"@glissade/react": minor
---

Add `<ScenePlayer>` — the declarative React component over `mount()` (DESIGN §4.3), the React twin of `<gs-player>`. Props are mount-native (`scene` + `timeline`) plus `loop`, `controls`, `autoplay`, `onFinished`, `onReady`, `className`, `style`. Optional controls bar (play/pause, scrubber, time readout) wired to the Player; live state via the existing `usePlayhead`/`usePlayerState` hooks. `onFinished` fires off each play's per-play `.finished` promise (re-armed on every play, autoplay and the controls Play button), never a polled signal. All `mount()` work runs in a `useEffect` keyed on `[scene, timeline]` (SSR renders the inert canvas only). Also exports `useSignal` as an alias of `useSignalValue` (the DESIGN §4 sketch name).

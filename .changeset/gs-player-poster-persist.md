---
"@glissade/element": minor
---

`<gs-player>` no-build embed ergonomics: `poster` and `persist`. `<gs-player poster>` (optionally `poster-t="<seconds>"`) paints a first-frame still — the pre-play paint, the `prefers-reduced-motion` rest state, and a real `<img part="poster">` a screenshotter/no-JS fallback can capture — snapshotted off a throwaway `createScene()` via the shipped `@glissade/backend-canvas2d/snapshot` seam (never the live scene, so the playhead is untouched) and hidden the moment playback begins. `<gs-player persist="key">` stores/restores the playhead in `localStorage` so a reopened embed resumes where it was (best-effort; private-mode/quota throws are swallowed). Both are player/element-side only — they never touch `evaluate()`, so determinism and seek≡play-through are unchanged; both default OFF, so a bare `<gs-player>` is byte/behavior-identical. (`pingpong`/`yoyo` already shipped.) element stays at 2.22 kB gz.

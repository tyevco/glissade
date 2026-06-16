---
'@glissade/player': minor
---

Accessibility + background playback (§4.2 / §4.1), realizing two PlayerOptions the spec described but the runtime ignored.

- `reducedMotion: 'respect' | 'ignore' | (doc) => Timeline` (default `'respect'`). Under `prefers-reduced-motion: reduce`, `'respect'` suppresses autoplay and holds the poster frame (`timeline.posterTime`, default = end state); the function form swaps in a calmer alternative timeline (rides the new `Player.swap`). `mount()` detects the media query (override with `prefersReducedMotion`). The decision logic is the pure, exported `planReducedMotion`.
- `background: 'pause' | 'run'` (default `'pause'`). While the tab is hidden, `'pause'` freezes and resumes where it left off — no wall-clock jump on return; `'run'` advances by the hidden duration (correct for ambient loops). Wires the previously-inert driver `visibility` hook.

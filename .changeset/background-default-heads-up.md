---
'@glissade/player': patch
---

Heads-up (behavior change in 0.8): `PlayerOptions.background` defaults to `'pause'` — a hidden tab now freezes and resumes where it left off rather than advancing by the hidden wall-clock duration. Embedders running ambient/looping players who relied on the old advance-through-hidden behavior should pass `background: 'run'` explicitly.

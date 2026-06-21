---
'@glissade/browser': patch
---

The single-file convenience bundle now exposes the whole clip tier on `window.glissade`: `presence`, `each`, `morph`, `clip`, `clipList`, and the clip stdlib (`popIn`/`slideIn`/`pulse`/`driftLoop`). These live on the tree-shaken `@glissade/core/clips` subpath (off the core base index for the core budget), so they were missing from `window.glissade` — consumers had to reinvent `presence()`. The `@glissade/browser` entry now re-exports `@glissade/core/clips` (only the bundle, never the core base index — that would pull clips into the core/index size budget). Measured IIFE grew 39.3 → 42.3 kB gz, still within the 45 kB `browser` budget.

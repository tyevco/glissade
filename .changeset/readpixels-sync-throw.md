---
'@glissade/backend-dom': patch
---

backend-dom: `readPixels()` now throws synchronously, not an async rejection

The DOM tier has no pixel buffer, so `readPixels()` can never succeed. It was `async`, so its throw became a rejected `Promise` that a plain `try { backend.readPixels() }` couldn't catch. It now **sync-throws** (the declared `Promise` return type is satisfied vacuously), so a non-awaited `try/catch` catches it.

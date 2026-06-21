---
"@glissade/browser": minor
---

Expose `splitText` on the `@glissade/browser` IIFE (`window.glissade.splitText`). The no-build consumer that requested kinetic typography works only against the single-file bundle, so its own feature must be on `window.glissade` (mirrors `pathFromSvg`). +0.44 kB, within the 47 kB browser budget. (Stack/Row/Column stay npm-only — they pull Yoga.)

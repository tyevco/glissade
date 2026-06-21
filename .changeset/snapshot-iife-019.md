---
"@glissade/browser": minor
---

Expose `renderToDataURL` / `snapshotCanvas` on the `@glissade/browser` IIFE (`window.glissade.renderToDataURL`). The no-build consumer works only against the single-file bundle, so the screenshot DX helper must be on it to be usable. Browser budget raised 46→47 for the +0.36 kB (the convenience bundle; the base embed stays lean at 38.6/39).

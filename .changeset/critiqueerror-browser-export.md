---
'@glissade/browser': patch
---

browser IIFE: re-export `CritiqueError` (+ the `ContainBound` type) on `window.glissade`, so a no-build author can `catch (e) { if (e instanceof glissade.CritiqueError) … }` — matching every other error class on the surface (KenBurnsError / MeasurerRequiredError / TextFitError / …). `CritiqueError` shipped on the Node `@glissade/scene/diagnostics` subpath in `0.77.0-pre.1` but was missing from the browser barrel (the explicit-export-list surface, not `export *`), so its advertised instanceof-catchability was real on Node but broken in the IIFE. Node ≠ browser surfaces diverge; both are now covered.

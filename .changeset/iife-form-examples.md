---
'@glissade/scene': minor
'@glissade/browser': patch
---

examples: no-build (IIFE) form of the example corpus

The runnable example snippets are npm `import`-form, which don't run verbatim in a no-build `<script src>` page. New `toIifeForm(code)` (exported from `@glissade/scene/examples`) rewrites `import { X } from '...'` → `const { X } = window.glissade`, and `examplesByKey({ iife: true })` returns the transformed corpus. The `@glissade/browser` IIFE now registers the no-build form, so `window.glissade.describe({ examples: true })` gives a no-build agent snippets it can copy-paste and run as-is. npm consumers still get the `import`-form (the doctest + the generated reference are unchanged).

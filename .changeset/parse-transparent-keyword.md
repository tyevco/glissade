---
"@glissade/core": patch
---

`parseColor` now accepts the CSS `transparent` keyword (= `rgba(0,0,0,0)`).

Previously `parseColor('transparent')` threw `ColorParseError`, which made `exportLottie` **hard-crash** (exit 1) on any scene with a `fill: 'transparent'` shape — the common stroke-only-shape idiom the render backends already honor. Now `transparent` parses to a fully-transparent color; the existing 4-element-alpha color path carries it through the Lottie round-trip to an invisible fill (not opaque black). Only `transparent` is special-cased — other CSS named colors still throw. Byte-identical for every previously-valid color (goldens unchanged).

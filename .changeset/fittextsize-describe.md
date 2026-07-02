---
"@glissade/scene": patch
---

`describe()`: list `fitTextSize` alongside `fitText`/`fitTextGroup`

`fitTextSize` (the size-returning primitive `fitText`/`fitTextGroup` build on) resolved and worked but was missing from `describe().helpers`, so a no-build author reading the manifest couldn't discover it. Added — the three fit helpers now all appear. (edcc canary nit `slkgussGtv1A`.)

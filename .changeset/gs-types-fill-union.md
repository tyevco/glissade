---
"@glissade/cli": patch
---

`gs types`: a polymorphic prop's value type is a UNION (fixes a false-positive)

The typed SDK emitted a polymorphic value type (the manifest's pipe-joined `'color|paint'` on `fill`) as a single string literal, so a valid `track('…/fill', 'color', …)` failed `TS2345` — the generated types red-lined *correct* code (a real consumer counted ~16 valid `fill` call sites). `gs types` now splits an ambiguous value type on `|` and unions it: `TypeIdOf<…/fill> = 'color' | 'paint'` and `ValueOf` the value union (`string | Paint`), so passing either member type-checks while a genuinely-wrong type (`'number'` on `fill`) and a typo'd path still error. The same union covers a path that carries different types across node types. A `color|paint` regression test guards it so single-value-type coverage can't hide it again.

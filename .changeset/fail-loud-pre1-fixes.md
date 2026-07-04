---
'@glissade/scene': patch
---

0.59 pre.1 — canary verify fixes:

- **No-build reach:** the fail-loud authoring tools (`validateScene`, `resolveAt`, `instanceProps`, `DIAGNOSTIC_SCHEMA_VERSION`) are now exposed on the `@glissade/browser` IIFE (`window.glissade`), so a no-build author reaches the 0.59 preflight/inspection affordances the release was built for — not just the runtime throw. The heavy diff/audit tooling on `/diagnostics` stays ESM-only. Base embed untouched.
- **`MeasurerRequiredError`** is now exported on the IIFE barrel so it is `instanceof`-catchable like every other fail-loud error class.
- **`OFF_CANVAS` reserved:** off-canvas detection needs composed ancestor world transforms (it false-positived on nested-Group scenes reading local position vs viewport). It is a rendered-geometry check → it moves to `critique()` (from the DisplayList) and is reserved in the diagnostic enum until then. `validateScene()` now emits only the static-structural codes: `UNKNOWN_TARGET`, `MEASURER_FALLBACK`, `YOGA_CHILD_POSITION`.
- The diagnostic enum now documents each code's enforcement point (validateScene vs createScene throw vs reserved-for-critique), and `player.seek(t)` is unit-tagged `seconds`.

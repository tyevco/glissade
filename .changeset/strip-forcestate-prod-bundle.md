---
"@glissade/interact": patch
---

build: strip the dev-only `__forceState` studio-preview escape hatch from the production bundle via build-time DCE (§A.2). The gate now reads a single `process.env.NODE_ENV !== 'production'` term so a bundler `define` can eliminate the branch; the published `dist` stays condition-bearing so consumers' bundlers strip it. `current` stays a `ReadonlySignal` and `input()`/`fire()` still throw `UnknownInputError` for unknown inputs.

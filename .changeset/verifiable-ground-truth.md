---
"@glissade/scene": minor
"@glissade/cli": minor
---

Verifiable ground-truth: make `describe()` a machine-checkable contract for the
`window.glissade` runtime surface, and give the no-build author types.

- **`describe()` gains an additive `surface` taxonomy** — one machine-readable
  enumeration of every export a `<script src>` author reaches on the IIFE (node
  constructors, helper/factory functions, the core callables, value objects, and the
  opaque type-only names signatures reference), each tagged `kind`/`form`/`iife`/`arity`.
  Optional and off the base embed (describe is tree-shaken off the base index), so it's
  additive and determinism-neutral.
- **`gs describe --lint`** + a `check:describe` CI gate — assert every `window.glissade`
  runtime export appears in `describe()`, every described type-name is type-only or
  resolves to a runtime value, and callable arities agree. Converts a recurring
  manual catch (a helper or type silently drifting out of the manifest) into a
  systematic gate, checked against the real built `@glissade/browser` bundle.
- **`gs types --global` / `--iife`** — emit a self-contained ambient `.d.ts`
  (`declare const glissade` + `interface Window { glissade }`) typing the whole IIFE
  surface from the manifest, so a no-build `<script>` author gets the same
  typo→compile-error safety `gs types` gave ESM `track()` authors. `--check`-guarded.

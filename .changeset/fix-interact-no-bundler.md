---
'@glissade/interact': patch
---

Fix `createMachine()` throwing `ReferenceError: process is not defined` in no-bundler browser / Deno runtimes. The `__forceState` dev-gate now uses `typeof process !== 'undefined' && process.env['NODE_ENV'] !== 'production'` — crash-safe when `process` is absent, and still dead-code-eliminated under a `process.env.NODE_ENV` production define (`pure && false` folds to `false`), so the production bundle stays free of `__forceState`. (0.11 canary blocker.)

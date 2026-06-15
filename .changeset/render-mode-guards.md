---
'@glissade/scene': minor
'@glissade/cli': patch
---

Render-mode determinism guards (§5.5): `withDeterminismGuards(mode, fn)` from `@glissade/scene` patches the banned globals (`Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`) for the synchronous scope of a single `evaluate()` — throwing a `DeterminismViolationError` under `throw` mode (CLI/CI), warning-once-then-delegating under `warn` (dev), and always restoring them afterward. `gs render` now wraps every frame's `evaluate()` in `throw` mode, so a scene that reads a wall clock or unseeded random is rejected at render time instead of producing a silently nondeterministic export. This is the runtime backstop to the static `@glissade/eslint-plugin` rules.

---
"@glissade/scene": patch
---

determinism-trace: never SILENTLY degrade to a bare throw when the locator can't name a node. A scene-frame helper that captures its `children` once and reuses them across `createScene()` calls returns SHARED node instances — so the twice-eval probe memoizes an impure signal and the two cold DisplayLists match by construction, defeating localization on exactly the long frame-helper episodes the feature targets. `auditCacheCold` now detects shared instances (`sharedInstances` on `CacheColdResult`), and `DeterminismViolationError` carries a `reason` explaining WHY it couldn't localize and how to fix it (rebuild children per `createScene()`) instead of a silent bare throw. Caught by a real-episode read (the shared-instance case synthetic fresh-node tests can't surface).

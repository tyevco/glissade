---
"@glissade/cli": patch
---

`gs render`: warn on a `@glissade/*` version skew (dual-package adopt trap)

Installing `@glissade/cli` at a different version than the `@glissade/core` a scene resolves is a dual-package hazard: the subpath side-effect registries (`@glissade/core/expr`'s track sampler, Yoga `layout`'s engine) register per-package-**instance**, so under a skew a *correctly* imported `@glissade/core/expr` or `layout` still fails with a misleading `expr tracks need import '@glissade/core/expr'` / `no LayoutEngine registered` — even though the import is present. `gs render` now resolves the scene's `@glissade/core` version, compares it to its own, and prints a clear **"version skew — align every @glissade/\* to X"** warning before evaluate, turning a confusing failure into an actionable one. A warning, never a hard error (it never blocks a render and stays silent when versions match or core can't be resolved). glissade is lockstep — bump all `@glissade/*` together.

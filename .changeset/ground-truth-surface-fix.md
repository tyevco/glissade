---
"@glissade/scene": patch
"@glissade/cli": patch
---

`gs describe --lint` / `gs types --global` pre.1 — two canary-caught fixes to the
`surface` taxonomy:

- **Complete the surface.** 15 real public `window.glissade` authoring exports were
  missing (`key`, `signal`, `spring`, `cubicBezier`, `namedEasing`, `springTo`,
  `pathFromSvg`, and the `glow`/`morph`/`typewriter`/`pulse`/`popIn`/`slideIn`/
  `presence`/`highlight` motion helpers), so the ambient `.d.ts` red-lined valid
  no-build code like `track('x/o','number',[key(0,0)])`. All are now surfaced (65
  entries). The generated node-prop interfaces also carry an index signature so a
  valid-but-unmodeled construction prop no longer red-lines.
- **Make the gate bidirectional.** `gs describe --lint` and `check:describe` now assert
  BOTH directions: no phantom (every surface entry resolves on the runtime bundle) AND
  no missing (every public `window.glissade` runtime export is surfaced or in an
  explicit, documented exempt-list). The keystone previously only checked no-phantom, so
  it stayed green on an incomplete surface — it now fails on an omission, which is the
  class it was built to gate.

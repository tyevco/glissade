---
"@glissade/scene": patch
---

0.26 discoverability (canary follow-up): runnable examples for the motion-craft helpers + `echo` in `describe().helpers`

Both no-build and video canary seats flagged that the new helpers were correct but under-discoverable via `describe()`:

- Added doctest-verified **corpus examples** (`@glissade/scene/examples`) for `orientToPath`, `lookAt`, `retime`, and `echo`, so `describe({ examples: true })` surfaces a copy-pasteable, verbatim-runnable snippet for each (the cold-agent onboarding path).
- Added **`echo` to `describe().helpers`** — it shipped as a scene index export without a helper entry, so a cold agent couldn't discover it via `describe()` (now listed like `Grid`/`orientToPath`).

Additive only — no render/determinism change; all goldens byte-identical.

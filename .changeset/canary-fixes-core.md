---
'@glissade/core': patch
'@glissade/scene': patch
---

0.14 canary fixes (1, 2, 5) — bind-time guard correctness + the orphaned-message-key check. Three mount-time / build-time fixes; no `evaluate()` change, so all 262 goldens stay byte-identical.

- **FIX 1 (BLOCKER) — vec2-arc false-throws on every vec2 prop.** The public `vec2-arc` value type samples to a valid `Vec2`, but every vec2 `registerTarget` site tagged the scalar `'vec2'`, so binding a `vec2-arc` track to `position`/`scale`/Highlight `offset` hard-threw `BindTypeMismatchError` at mount. Those targets are now tagged polymorphically `['vec2', 'vec2-arc']` (`@glissade/scene`: `node.ts` position/scale, `tokenHighlight.ts` offset). A `vec2-arc` track binds and samples to a finite `Vec2`.

- **FIX 2 (BLOCKER) — `registerTarget`'s required 3rd arg broke the public Custom-node seam + 0.13 back-compat.** `registerTarget(path, sig, expects)` made `expects` required, so external `Custom`/`Node` subclasses (and prebuilt 0.13 custom nodes calling the 2-arg form) hit `binding.ts` with `expects === undefined` → every track on a custom prop hard-threw. `expects` is now OPTIONAL (no default — left `undefined`), and `bindTimeline`'s guard skips an UNtagged target (`expects === undefined || …includes(got) …`). An untagged custom-node prop binds ANY track (0.13 had no guard); built-in tagged targets keep their guard. `BindTarget.expects` / `BindablePropTarget.expects` widen to `… | undefined`.

- **FIX 5 (HIGH) — stale/typo'd `messages.<locale>.json` key silently dropped.** `localize()` consumed table entries by membership only, so a key matching no node-id (and no `t()` id) silently localized nothing — that node shipped base text, no error. `localize` now collects the node-ids it consumes, folds in the `t()`-consumed ids (`getConsumedMessageIds()`, reset by `setMessageTable`, passed via the new `LocalizeOptions.consumedIds`), and throws a `LocalizationError` naming every orphaned key. A fully-matched table is silent.

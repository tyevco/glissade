---
'@glissade/core': minor
'@glissade/scene': minor
---

Add the 0.14 scalar→vec2 **bind-time type guard** (§2.2) — the runtime correctness floor for the silent-NaN class. A scalar `number` track bound to a `vec2` prop (e.g. authoring `scale: 0.8` instead of `[0.8, 0.8]`) used to silently sample to `[undefined, undefined]` → a NaN matrix → the node and its whole subtree vanishing, with no error. Any track-type ↔ target-shape mismatch (a `number` track on a `paint`/`path` prop, a `color` on a `number`, …) was the same silent failure.

Now `bindTimeline` (`@glissade/core`) checks each compiled track's `type` against the target's declared accepted type and hard-throws a typed `BindTypeMismatchError` — naming the target, the got (track) type, the expected (prop) type, and a fix hint (`scale.x`/`scale.y` for the vec2 case). This matches the existing "unbound tracks are build errors" precedent (`UnboundTargetError`): a mismatched bind is a build error, not a silent no-op.

Mechanism (additive, golden-safe — a *correct* bind is unchanged, so all 252 goldens stay byte-identical):

- `BindTarget` (core) gains `readonly expects: ValueTypeId | readonly ValueTypeId[]` (an array for a polymorphic prop — a Shape `fill` accepts both `color` and `paint`). New exports: `BindTypeMismatchError`, the `Vec2Component` type.
- `vec2Signal` tags its compound (`'vec2'`) and its `.x`/`.y` sub-signals (`'number'`).
- `registerTarget` (`@glissade/scene`) takes the prop's accepted type and stamps it; every node prop is tagged (`position`/`scale` vec2; their `.x`/`.y` + `opacity`/`rotation`/`zIndex`/`width`/`height`/`cornerRadius`/`radius`/`strokeWidth`/`reveal`/`fontSize`/Layout/shader uniforms number; `fill` color|paint, `stroke`/Text-`fill`/Highlight color, `d` path, `text` string).

The 0.13 clip stdlib `popIn`/`pulse` already author vec2 `scale` keys, so they pass the new guard unchanged. The scalar→pair *broadcast* (lifting `0.8` → `[0.8, 0.8]`) is deliberately deferred to 0.15 — it would mask the wrong-prop mistakes this guard is meant to catch.

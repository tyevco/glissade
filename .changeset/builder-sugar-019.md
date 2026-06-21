---
'@glissade/core': minor
'@glissade/scene': minor
---

0.19 builder sugar — three additive, pure build-time slices that compile to the serializable Timeline document (goldens stay byte-identical):

- **Unknown builder options now throw** (`k-g1zn`). `to` / `fromTo` / `set` / `stagger` validate their options object against a known-key allow-list and throw a `TimelineValidationError` naming the offending key(s) and the method, instead of silently swallowing it. Known keys: `to`/`fromTo` → `duration`, `ease`, `at`, `from`; `set` → `at`; `stagger` spec → `to`, `from`, `duration`, `ease`; `stagger` opts → `each`, `anchor`, `at`. **Mildly breaking:** stray keys that were previously ignored now fail loudly at build time.
- **Per-target `stagger` spec values** (`ppCUmU`). `StaggerSpec.to` and `.from` now accept a function `(index, count) => value` resolved per target (a runtime `typeof` branch, consistent with `each` and scene `each()`), so a per-target-destination cascade is expressible. A plain value still fans uniformly. Emits N ordinary tweens, byte-identical to hand-authored.
- **`tl.tracks(tracks)`** (`Isuo8Gxn`) — a fluent bridge for the clip tier. Inject the pre-built `Track[]` returned by `presence`/`clip`/`each`/`morph` straight into the document; they land as ordinary absolute-time track rows via the same finalize→coalesce path `add()` uses for child tracks. Scoped to raw absolute-time tracks (no cursor-offset/rebasing wrapper).

`@glissade/scene`'s `describe()` manifest is updated in lockstep: the new `tracks` builder method is listed and the `stagger` signature reflects the `to`/`from` function form.

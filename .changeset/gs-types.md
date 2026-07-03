---
"@glissade/cli": minor
---

`gs types` — codegen a type-checked `track()` SDK from the describe() manifest

`describe()` already tells an agent which props are animatable and their value types, but at *runtime* — nothing stops authoring `track('circle/opasity', 'color', …)` until it throws at bind time. `gs types` makes guessing a track target a **compile error**:

```sh
gs types --out src/glissade-targets.ts          # generate from the live describe() manifest
gs types --out src/glissade-targets.ts --check  # CI gate: fail if it drifted from describe()
```

The generated file declares a `KnownTrackPath` union (every animatable path in the taxonomy + your `defineComponent` targets), a `TrackTarget` template (`` `${string}/${KnownTrackPath}` ``), and per-path value-type maps — then re-exports a **type-narrowed `track`** whose runtime *is* `@glissade/core`'s `track` (zero added runtime). Importing `track` from it turns a typo'd prop-path or a wrong value-type id into a TypeScript error, closing the "read the d.ts, don't guess" loop for agent authorship. Deterministic output (drift-guardable with `--check`, like the generated API reference); reads the live manifest or a committed `--from api.json`.

Scope: the manifest is instance-free, so this checks the prop-path + value type — verifying a scene's node `<id>` is real is a follow-up (a bad id still fails loud at bind time). CLI-only; base embed unchanged. Docs: `docs/for-agents.md`.

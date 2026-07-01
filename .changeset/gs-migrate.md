---
"@glissade/cli": minor
---

`gs migrate` + `gs describe` — the describe()-driven engine-bump assistant (ends the adopt-debt)

Bumping the engine across several minors used to mean hand-repointing moved imports (`tokenHighlight`→`/scene/tokens`, `motionPath`→`/scene/motion`), guessing which symbols were removed, and eyeballing a scary unreviewable batch. But `describe()` (0.18) already pins version + node/prop taxonomy + import subpaths + builder signatures per release — **so the diff between two manifests IS the migration surface.**

```sh
gs describe --out api-0.30.json     # snapshot THIS engine's API manifest (commit it per release)
gs migrate api-0.30.json            # diff that baseline against the current engine
gs migrate api-0.30.json --json     # machine-readable report (an agent codemod's input)
```

`gs migrate` reports, with the right breaking/additive classification and a suggested fix per breaking item:

```
gs migrate: 0.13.0 → 0.31.0
  3 breaking · 5 additive · 8 total

BREAKING — action needed:
  → [helper] tokenHighlight: import moved @glissade/scene/diagnostics → @glissade/scene/tokens
      ↳ import { tokenHighlight } from '@glissade/scene/tokens'
  ✗ [node]   LegacyThing: node type removed (was imported from @glissade/scene)
  ~ [prop]   Text.wrap: value type number → vec2
      ↳ a Track on Text.wrap now expects a vec2 value — VERIFY every keyframe
ADDITIVE — new in this engine:
  + [node]   MotionBlur: new node type (import from @glissade/scene)
  …
```

The report is generated **FROM the real registry** — it cannot claim a move that didn't happen, so the no-drift guarantee extends to migration itself (an identical manifest yields an empty report). It detects moved imports (node subpath + helper import), removed/added nodes · props · helpers · builder methods · value types · easings, prop value-type changes, and animatable transitions — each `breaking` when a consumer on the old engine could break, `additive` otherwise.

This MVP is **advisory** — it hands you the precise, exhaustive change list + a suggested action per item; it never touches your files. (AST source-rewriting is deferred: the `--json` report here is exactly the input such a codemod would consume.) Ships entirely in `cli`; nothing added to the embed path.

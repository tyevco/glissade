---
'@glissade/core': minor
'@glissade/scene': patch
---

0.15 guard-repr-compat: generalize the bind guard from strict id-equality to single-hop representation-compatibility, and retire the vec2-arc array-tag hack.

`ValueType` gains an optional `repr?: ValueTypeId` — the built-in type a custom type is representationally compatible with (a `cents` type sets `repr: 'number'`, `vec2-arc` sets `repr: 'vec2'`). The bind-time guard (`binding.ts`) now resolves both the track's value-type and the target's `expects` to their repr (single-hop; an id with no `repr` resolves to itself) and accepts when the reprs match. This reopens the documented extension door: a custom `number`-repr track binds to a `number` prop without throwing.

The 0.14 `['vec2','vec2-arc']` array-tags on `Node.position`/`Node.scale` and `tokenHighlight` `offset` are reverted to plain `'vec2'` — repr-compat handles vec2-arc now. `Shape.fill`'s `['color','paint']` stays: that is genuine polymorphism (distinct reprs). Bind-time only — all goldens stay byte-identical.

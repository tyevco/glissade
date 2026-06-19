---
'@glissade/scene': minor
---

Add `each()` (0.13) — deterministic parametric instancing in `@glissade/scene` (base entry). Pure build-time sugar: generate N scene nodes from a factory, lay them out in aspect-fraction space (`row`/`column`/`grid`/`ring` discriminated-union layouts, or an `(i, n) => [fx, fy]` escape hatch), and optionally fan a motion `clip` across the clones with `stagger` + `distribute` (`'delay'`/`'from-center'`/`'from-edges'`) + seeded `jitter`. Returns `{ node, children, tracks, end, places }`.

Each clone is stamped with a stable `${id}/${i}` id (a factory-set conflicting id is rejected, an unset one is filled), wrapped in a `Group({ id })`, and its prop signals become ordinary `clip.apply` track targets — so every `--workers` export shard reconstructs the identical id set and the emitted `Track[]` are byte-indistinguishable from hand-authored ones (a golden holds by construction). Per-clone RNG is the seeded `random(mix(seed ?? hash(id), i))` from core, never `Math.random`, so jitter is reproducible and clean under `withDeterminismGuards`. The clip runtime is imported TYPE-ONLY, so `each` adds no clip bytes to the embed.

Also: the scene target resolver now splits a track target on its LAST `/` (was the first), so node ids that contain slashes — the `${id}/${i}` ids `each` mints — resolve their prop suffix correctly. Single-slash targets are unaffected (no registered prop path contains a slash), so existing scenes are byte-identical.

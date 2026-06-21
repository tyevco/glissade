---
'@glissade/core': minor
---

feat(core): `tl.sequence` + `tl.at` builder methods — compose 0-relative sub-timelines

Pure build-time sugar over the shipped `add()`:

- `at(time, sub)` places a 0-relative sub-timeline at an absolute parent time — exactly
  `add(sub, time)` (a numeric position resolves to itself). The method `at` is distinct
  from the `at` *field* in `TweenOpts`/`StaggerOpts`.
- `sequence(subs, { gap = 0 })` chains N subs end-to-end: each is `add`ed at the running
  chain end, with a scalar `gap` (seconds) of slack between consecutive subs — identical
  to a hand-written `add(a); add(b, '+=gap'); add(c, '+=gap')` chain. Because `add`
  advances the cursor by each sub's compiled duration, changing one sub's internal length
  auto-shifts the rest. A negative `gap` overlaps arithmetically (no crossfade is
  synthesized — that's a deferred design). `gap` is scalar in v1 (per-index gap deferred).

Both emit ordinary `ChildEntry` rows — serializable, zero runtime, seek ≡ play-through.
New opt-in methods, default behavior unchanged; all 262 goldens stay byte-identical.

Also: `add()` now **forwards a child sub-timeline's `.call()` callbacks** onto the parent
document's callback map (rebased markers already surfaced via `compileTimeline`, but their
name→fn entries were unreachable through `getTimelineCallbacks(parentDoc)`). A parent's own
callback wins a marker-name collision. This makes `.call()` in a sequenced/added sub fire
as expected — benefiting both `add` and `sequence`.

---
'@glissade/core': minor
---

feat(core): stagger `anchor` rename + non-uniform `each` + cursor fixes, and a `.call()` sibling-collision fix

**stagger API (pre-only, no back-compat):**

- `StaggerOpts.from` → `StaggerOpts.anchor`. The placement anchor shared the word
  `from` with `StaggerSpec.from` (the start VALUE that routes a target through
  `fromTo`) — two different axes, one word. Renamed the placement one to `anchor`
  (`'start' | 'end' | 'center' | 'edges' | number`).
- `each` widened to `number | ((rank, count) => number)`. A number keeps the
  uniform cascade `d_i = rank_i * each`; a function maps each target's rank +
  group size to its own delay, completing GSAP parity for accel/decel/eased
  cascades. Keys stay byte-identical to the hand-authored equivalent.

**stagger cursor-semantics fixes** (the post-stagger cursor a following
`'<'`/`'>'`/`'+='`/default step resolves against):

- A spring `spec.ease` now contributes its real `spring.duration(ease)` to the
  group end, not the local `duration ?? 1`.
- An empty `targets` list is a true no-op — the cursor is untouched.
- The group reports its **true** min/max delay (over all `d_i`, init from `d_0`),
  so a backward / non-monotonic spread anchors honestly.
- A delay that would place a key at `t < 0`, or a non-finite `each`/`anchor`
  (incl. a function returning NaN/Infinity), throws a `TimelineValidationError`
  at build time instead of emitting silent negative / NaN keys.

**`.call()` sibling-collision fix:** auto-named `call:N` markers are namespaced by
the sub's position path (`c<index>/…`) when rebased into a parent, and the same
prefix is applied when forwarding the sub's callback map. Two sibling subs that
each define a `.call()` (both auto-named `call:0`) now land under distinct keys
and both fire — previously one callback was dropped and the other double-fired.

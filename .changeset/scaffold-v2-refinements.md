---
"@glissade/cli": minor
---

`gs scaffold` (Era B v2) — two refinements from ai-training's real-content gate, both anti-workslop safe-direction:

- **Split-suffix continuation coalescing.** A `-b`/`-b2`/`-c`… id suffix marks one beat split across a pause (the convention keeps the first half's id — `<base>` or `<base>-a` — so the `.start()` anchor survives). The scaffold now emits the recipe/beat ONCE on the base and marks the continuation `// … continues '<base>' (a pause-split of one beat)` instead of double-emitting the card — so a split cold-open no longer produces two `recipe('cold-open')` cards the author merges back to one. Still in the `require([...])` guard; deterministic (a pure function of the id set).
- **Frame-owned bookend hint.** `footnote`/`credit` are frame-owned bookends (the episode frame emits them), so they're no longer matched as a `lower-third` recipe (which would be a confident-wrong pick for a frame beat) — they're honest stubs tagged `[likely FRAME-owned → route to your // TODO frame]`, alongside `habit`/`outro`/`next`/`endcard`, to save the author the delete. `lower-third` now matches only real name supers (`speaker`/`name`/`lower-third`).

Both preserve the determinism + anti-workslop spine (a continuation and a frame-owned hint are honest labels, not guesses); CLI-only, off the render path (b4e6060006 unaffected). The CLI summary now also reports coalesced continuations.

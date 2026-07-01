---
"@glissade/cli": patch
---

`gs migrate`: don't crash on a baseline that predates a `describe()` field (the deep-jump case)

`gs migrate` reads a saved API manifest and diffs it against the current engine — and the whole point is *deep* jumps. But a baseline older than a given `describe()` field simply doesn't have that field: `helpers` was added after 0.19, and `builder` / `valueTypes` / `easings` each have their own introduction point. The manifest-validity check only requires `version` + `nodes`, so an old-but-valid manifest passed validation and then threw a raw `TypeError` (`Cannot read properties of undefined (reading 'map')`) in the diff — on exactly the long-lived-jump path the tool exists for.

`diffManifests` now treats **every** collection as possibly-absent on either side (missing ⇒ empty): a field the current engine has but the baseline didn't records as *additive*, a field the baseline had but the current engine dropped records as *breaking*, and nothing crashes. Verified on a real 0.19.1 (pre-`helpers`) manifest end-to-end, plus a regression test for each direction. Also documents the data-history nuance in the migration guide: a symbol shows up as **moved** only when the baseline recorded its old import path — a baseline older than a move sees the symbol as additive-at-its-current-path (still the exact import you need). Caught by two canary seats on 0.31.0-pre.0.

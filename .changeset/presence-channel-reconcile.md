---
'@glissade/core': patch
---

fix(core): presence reconciles non-opacity channels per target (slide-in-hold-slide-out no longer truncates)

When a `presence()`'s enter AND exit both animated the SAME non-opacity channel
(e.g. both slide `position` — a slide-in, hold, slide-out), presence emitted TWO
same-target tracks. `compileTimeline`'s `coalesce()` then dropped the enter's
settle key and dev-warned — the hold leg of the slide was silently truncated.

Non-opacity channels are now reconciled per target into ONE track, using the same
stable-sort + coincident-`t` later-wins dedup the opacity guard already uses (at a
coincident enter-settle / exit-start `t` the exit wins). The enter settle and exit
start both survive, so a slide-in-hold-slide-out works. Default opacity-only
presence is byte-unchanged (the presence golden is byte-identical).

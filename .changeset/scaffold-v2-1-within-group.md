---
"@glissade/cli": patch
---

`gs scaffold` (Era B v2.1) — the split-suffix continuation coalescing now also folds a `-a2`/`-a<digit>` WITHIN-GROUP continuation. v2 coalesced new-letter continuations (`-b`/`-c`) into the base beat, but a `<base>-a2` (a second segment of the same `-a` split group — e.g. a send-line reveal in two parts) stayed a separate stub. Now `<base>-a<digit>` coalesces into `<base>-a` (the base half, `-a` with no digit, stays the base), so the whole split group is one beat with continuations, not several stubs the author merges. Deterministic (pure function of the id set), CLI-only, off the render path (b4e6060006 unaffected). Filed from ai-training's 0.71.0 real-e02 edge note; safe-direction (a continuation label, never a guess).

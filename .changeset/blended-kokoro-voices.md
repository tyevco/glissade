---
'@glissade/narrate': minor
---

feat(narrate): blended Kokoro voices — pinned style-vector interpolation (gh#2)

A segment's `voice` now accepts EITHER a provider voice name (string, unchanged)
OR a Kokoro **blend spec** — a weighted sum of two-or-more base voices' `[510×256]`
style vectors:

```jsonc
"voice": { "blend": [["zf_xiaoni", 0.65], ["zf_xiaoxiao", 0.35]] }
```

Weights normalize to sum to 1; the summed style vector is computed once at prepare
from the committed Apache-2.0 `voices/<name>.bin` bytes (the blend of two Apache-2.0
voices is itself a derived Apache-2.0 voice, logged at synth for provenance) and driven
through the model directly (the g2p-bypass route — a blend has no registered name). The
blend identity (base names + normalized weights + a spec version) folds into the segment
cache key, so any weight / base-voice change re-synthesizes exactly the affected segments,
mirroring the 0.15 misaki g2p-identity contract.

Language is inferred from the base-voice prefixes (all `zf_`/`zm_` → Chinese via
`misaki[zh]`; all English → English); a mixed-language blend throws. Chinese (`z*`) blends
are the tested deliverable; English blends are scoped out as a documented follow-up (the
model's English phonemizer isn't exposed for the bypass route). Non-kokoro providers reject
a blend with a clear error. Prepare-time only — render, `evaluate()`, and the golden frames
are untouched.

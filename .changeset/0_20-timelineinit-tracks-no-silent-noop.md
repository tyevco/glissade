---
"@glissade/core": minor
---

0.20: `timeline(fn, { tracks })` no longer silently drops the tracks (KMu5GL1DvFms)

The builder form's second argument advertised a `tracks` field (via `TimelineInit`)
but **silently ignored it** — `timeline(tl => {}, { tracks: [t] })` produced an empty
document with no error or warning, costing a consumer a debug cycle (a near-empty PNG:
a correct caption group whose `popGroup` carried no glyphs). It was long-standing
(no-op on 0.18 / 0.19 / 0.20-pre.5, not a regression).

The builder-form `init.tracks` is now **applied** — composed into the built document
at the same place and in the same shape `tl.tracks(...)` injects them (the
finalize→coalesce path; raw absolute-time rows, no cursor move). `init.tracks` lands
first, so a `tl.tracks(...)` call inside the body coalesces later-wins over it at a
shared target. The builder form's `init` type no longer `Omit`s `tracks`, so the field
type-checks where it now functions.

Unchanged: the object/document form `timeline({ tracks, fps, duration })` already
honored its tracks (untouched); `tl.tracks(...)` still works. No render-path change —
all 262 goldens stay byte-identical.

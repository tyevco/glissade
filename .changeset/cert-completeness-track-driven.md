---
'@glissade/cli': patch
---

**0.63.2 pre.1 — cert completeness now detects TRACK-DRIVEN text (captions).** The
completeness check previously walked the scene at CONSTRUCTION time, which misses
track-driven text: `captionNode` paired with `captionTrack` (a `Track<string>`)
populates the caption's text at EVAL time, so its `text()` is empty at construction —
the walk saw no text, marked the cert `complete: true` with an empty `fontDigest`,
and a caption-only scene stayed cacheable (the false-hit, still open for captions).

The completeness check is now an eval-time **DL-sample pre-pass**: it evaluates the
full certified frame grid and collects the font families of the `fillText` draws the
render actually produces. This is ground truth — it catches static text, track-driven
captions, and any dynamic text — and it is identity-independent (plain draw commands),
so it also sidesteps the jiti dual-instance `instanceof` trap. The pre-pass is a pure
read of `evaluate()` (a pure function of time), so it is render-neutral: a
`--certify` render is byte-identical to a plain render (verified), and all 415 goldens
stay byte-identical.

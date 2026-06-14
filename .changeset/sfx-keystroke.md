---
'@glissade/sfx': minor
---

`keystrokeClips(marks, source, opts)` — the typewriter's audio half, one `AudioClip` per typed or deleted character. Consumes the structural `KeystrokeMark = { time, grapheme, kind? }` shape, which both the typewriter's `EditMark[]` (insert + delete) and a monotonic `revealSchedule()`'s `RevealMark[]` (inserts only) satisfy. Whitespace is skipped by default, a backspace can take a distinct `deleteVoice`, and the per-key pitch/gain variation is index-seeded (reusing `buildSfxClips`) so a typing run stays alive instead of machine-gun identical. Char-class policy lives here; the marks stay neutral data.

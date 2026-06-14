---
'@glissade/scene': minor
---

Typewriter reveal primitive on `Text`. A new `reveal` prop/track (`'<id>/reveal'`) shows the first N graphemes of the laid-out text, left-to-right — the terminal/typed-text effect as pure data. Default `Infinity` (fully shown), so every existing scene and golden is byte-identical; line breaking runs on the full text first, so revealing never reflows.

- `Text.graphemes(measurer?)` — the laid-out grapheme stream (emoji/combining marks stay whole), to author a per-keystroke staircase: `track('title/reveal', 'number', g.map((_, i) => key(t0 + i * 0.05, i + 1, { interp: 'hold' })))`.
- `Text.revealHead(measurer?)` — the caret point just after the last revealed grapheme.
- `TextCursor` / `textCursor(text, opts?)` — a sibling caret that rides the reveal head: solid while typing, then blinking once fully shown.
- `revealSchedule(text, revealTrack, measurer?): RevealMark[]` — a pure per-grapheme schedule (`{ charIndex, grapheme, time, x, y, line }`), the direct analogue of narrate's `TimedWord[]`. This is the contract `@glissade/sfx` keystroke-sync will consume (one click per mark at `at: time`); char-class policy (skip space/newline, pick a sample) is left to the audio layer.

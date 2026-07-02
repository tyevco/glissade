---
"@glissade/scene": minor
"@glissade/narrate": minor
---

Authoring-loop v1: word-level narration anchors + Text `box`-valign + `fitText` shrink-to-fit

The "text/timing geometry the author shouldn't hand-roll" trio (from the OYP series QA sweep):

- **`narration(timing).word(segId, word, nth?)`** (+ `.wordEnd`) — land a visual on the spoken WORD, not the whole segment. Reads the per-word timestamps already in the timing manifest (`words[]`); matches case- and punctuation-insensitively (`'busy'` finds `'busy.'`), `nth` disambiguates a repeat. Fails loud if the segment has no word timings or the word isn't found (no silent drift to segment start). Pure lookup — zero determinism impact.

- **`Text({ box: { valign: 'center' | 'top' | 'bottom', h? } })`** — optically center a label in a box using its REAL ink metrics (ascent + descent, single- and multi-line), replacing the `fontSize * 0.35` fudge every boxed-text component hand-rolls. `'top'`/`'bottom'` frame the ink in an `h`-tall box centered on the position. **Opt-in and default-preserving** — omitting `box` is byte-identical, so every existing Text golden is unchanged; highlights/reveals follow the shifted text. New golden + showcase scene (`boxtext`: baseline vs ink-centered pills).

- **`fitText(text, { maxW, maxLines?, maxH?, minPx? })`** / **`fitTextGroup([texts], { maxW })`** / **`fitTextSize(...)`** (on `@glissade/scene/type`) — shrink-to-fit + wrap-to-max-lines via a build-time binary search over the measurer (like `Grid`/`splitText`), including a real ink-width check so an unbreakable word can't overflow silently. `fitTextGroup` fits several texts to ONE shared size (kills the ragged-headers bug). Fails loud on impossible fit (or `onOverflow: 'clamp'`); pass `{ measurer }` for exact results. Re-exported onto the browser IIFE. Docs: `docs/text-fitting.md`.

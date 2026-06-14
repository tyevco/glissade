---
'@glissade/narrate': minor
---

Pause beats: pacing as first-class, addressable narration data. A narration script may now interleave `{ "pause": <seconds>, "id": "...", "bed": "hold" | "silence" | "swell" }` elements between segments. A pause is an addressable **window**, not dead air — it produces the same anchors a segment does (`beats.start/end/duration('id')`, plus `beats.at('id', offset)` for sub-beats and `beats.labels()` entries), supplies its own silence (suppressing the default inter-segment `gap` around it), and shifts every later segment's start, so the whole track re-flows on re-narrate.

The per-pause `bed` mode threads into `duckEnvelope`: `hold` (default) keeps the bed ducked across the pause, `silence` cuts it to a floor (`{ silence }` to set the level, default 0), `swell` lets it breathe back to base while the voice rests. `duckEnvelope` was reworked to a per-transition ramp model that handles contiguous different-level windows correctly; its output for pause-free manifests is byte-identical to before. The manifest gains an optional `pauses: TimedPause[]`; `narration()` resolves segments and pauses in one id namespace (collisions throw). Pure manifest data — golden-stable.

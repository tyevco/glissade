---
'@glissade/narrate': minor
---

Caption split-cues — a long narration segment can split into timed sub-cues instead of overflowing or shrinking to the floor. Opt in with `captionSplit: { maxChars }` in the script; it's persisted into the timing manifest so `captionTrack` (burned) and `toSrt`/`toVtt` (sidecars) all call the same exported `splitCaption(segment, maxChars)` and split at identical boundaries — chunking on word boundaries and timing each sub-cue from its first word (per-word alignment), or dividing the window evenly when words are absent. Omitted by default ⇒ no split ⇒ byte-identical.

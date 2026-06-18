---
'@glissade/cli': patch
---

`gs render --chapters vtt` now writes **only chapter-kind cues** as WebVTT chapters by default — ad-break and plain `cue` markers stay out of the chapter list (they remain in `cues.json` for machines), so the VTT pastes straight into a YouTube description without manual filtering. Override the set with `--chapters-kind <kind[,kind]>` (e.g. `--chapters-kind chapter,ad-break`). `cues.json` is unchanged — it keeps every kind. The `00:00` "Intro" anchor logic now applies to the filtered chapter set.

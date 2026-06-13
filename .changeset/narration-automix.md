---
'@glissade/cli': patch
---

`gs render` now auto-mixes narration, closing the asymmetry a consumer flagged: 0.4.x auto-mixed a sibling music manifest but the narration voice still had to be hand-wired onto `timeline.audio` (the music manifest read the narration timing only to *duck* the bed, never to add the voice). Now a sibling `<scene>.narration.timing.json` is discovered and its clips mixed automatically — scene + narration manifest → a voiced mp4, zero-config, the promise the music-parity framing implied. `--narration off` opts out. Author-wired clips are detected and never doubled (the same +6dB guard as the bed), and the browser-export path is unchanged (it mixes only `timeline.audio`, so wire `beats.clips()` there).

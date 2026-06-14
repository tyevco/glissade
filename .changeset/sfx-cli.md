---
'@glissade/cli': minor
---

`gs sfx` — the sound-effects prepare step + render auto-mix, closing the SFX zero-config loop (parity with narration/music). Write a `<scene>.sfx.json` with effect hits that anchor to a narration beat (`{ voice, anchor, offset }`, resolved against the sibling `*.narration.timing.json` so they re-flow on re-narrate) or use an absolute `at`. `gs sfx <scene>` resolves the times, renders the referenced voices once (deduped) to `<scene>.sfx-cache/`, bakes the deterministic index-seeded jitter into a committed `<scene>.sfx.timing.json`, and `gs render` auto-mixes that manifest with zero config (`--sfx off` opts out). Author-wired clips are detected and never doubled (the +6dB guard). v1 drives the procedural `sfxr` source; sample packs remain available from code via `@glissade/sfx`'s `buildSfxClips`.

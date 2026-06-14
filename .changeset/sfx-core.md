---
'@glissade/sfx': minor
---

New package `@glissade/sfx` — sound effects, determinism- and license-safe. A clean-room procedural synth (`renderSfxr`: waveform + attack/sustain/decay envelope + pitch slide + one-shot arpeggio) renders **byte-identical** Int16 WAVs from a fixed param set, with the noise voice drawing from core's seeded `random` (no `Math.random`, no third-party synth code — bundled effects are unambiguously Apache-2.0 / license-clean). Ten frozen presets (`click tap pop whoosh success error type select coin blip`).

The source seam mirrors narrate's provider shape: `SfxSource = { id, version(), voices(), render(voiceId) }`. `sfxrSource()` is the procedural bank; `samplePackSource(pack)` backs effects with committed audio but **hard-throws** when `license` or `source` is missing (nothing unlicensed ships by omission). `buildSfxClips(hits, source, opts)` places one `AudioClip` per hit, with INDEX-SEEDED pitch/gain variation (`random(seed ^ hash(source/voice) ^ index)`) so repeated hits don't sound identical while staying a pure function of position — re-evaluation never drifts. `renderSfxAssets` renders the referenced voices once (deduped) for committing. The `gs sfx` prepare step and render auto-mix join land next; `keystrokeClips()` (consuming the typewriter's `revealSchedule()`) is a tracked 0.5.x follow-up.

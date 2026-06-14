---
'@glissade/narrate': patch
---

`piperProvider` is now deterministic by default. VITS adds noise (generator + a stochastic duration predictor), so vanilla piper re-synthesizes the same text to slightly different audio/durations — which re-pins any goldens anchored to narration timing. glissade now passes `--noise-scale 0 --noise-w-scale 0`, making re-synthesis byte-identical (verified end-to-end on real piper-tts 1.4.2). Opt into piper's natural-but-drifting prosody via `piperProvider({ noiseScale: 0.667, noiseWScale: 0.8 })` + `providerImpl`. The noise mode is part of the provider version, so switching deterministic↔natural invalidates the cache.

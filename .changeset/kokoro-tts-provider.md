---
'@glissade/narrate': patch
'@glissade/cli': patch
---

Add a **Kokoro** TTS provider (`--provider kokoro`) — an Apache-2.0, 82M-param neural voice that is markedly more natural than espeak/piper, fully offline on CPU, with no API key. Unlike piper there's no `pip install` or external binary: it runs **pure-Node** via [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) (Transformers.js + onnxruntime), declared as an **optional peer dependency** — `npm i kokoro-js` only if you use it. The model downloads and caches on first use; pick a voice via the script's `voice` (e.g. `af_heart`) and the quant via `kokoroProvider({ dtype })` (`q8` default, `fp32` for top quality).

Deterministic by construction: Kokoro inference uses a fixed voice/style embedding (not diffusion-sampled per call), so the same text re-synthesizes byte-identical — verified by a gated determinism test. `version()` pins the `kokoro-js` version + model + dtype, so any of those moving invalidates the per-segment cache. New exports from `@glissade/narrate/providers`: `kokoroProvider`, `floatToWav`, `KokoroDtype`.

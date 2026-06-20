---
"@glissade/narrate": minor
---

narrate: misaki[zh] g2p engine (Fork B) — a real Mandarin route for kokoro z\* voices

`kokoroProvider` no longer hard-errors on Chinese (`zf_`/`zm_`) voices. A new
Zh-g2p seam (`misakiZhG2p`, `packages/narrate/src/zh-g2p.ts`) shells out to a
pinned Python `misaki[zh]` (Fork B — same `spawnSync` + ENOENT-feature-detection
pattern as the piper/espeak providers) to turn Mandarin text into the custom-IPA
+ arrow-tone phoneme string those voices were trained on, then drives the kokoro
`generate_from_ids` g2p bypass (`text → zhG2p(text) → tokenizer(phonemes) →
generate_from_ids(ids, {voice})`). Non-Chinese voices keep the unchanged
`generate(text)` path.

The g2p identity (engine-id + jieba-dict hash + phoneme-map version + the pinned
Python-misaki wheel) folds into `kokoroProvider.version()` for a z\* voice, so any
g2p change invalidates the prepare-time segment cache (cache reproducibility).
This is all PREPARE-TIME: `evaluate()` and the render path are untouched and stay
byte-deterministic.

A committed parity corpus (`packages/narrate/test/fixtures/misaki-zh-parity.json`,
regenerable via `scripts/gen-misaki-parity.py`) is the shared g2p oracle — a
future pure-TS Fork A can be validated against the same fixture offline.

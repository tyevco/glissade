---
'@glissade/narrate': minor
---

narrate: English Kokoro voice blends (gh#2 follow-up)

Kokoro voice blending (`voice: { blend: [[name, weight], …] }`, shipped Chinese-only in 0.16) now supports **English** voices (`af_`/`am_`/`bf_`/`bm_`). A blend has no registered name, so it's synthesized through `generate_from_ids` with the summed style tensor — which bypasses kokoro-js's built-in phonemizer — so glissade runs **`misaki[en]`** itself (the g2p the English voices were trained on), exactly as it already runs `misaki[zh]` for Chinese blends.

English blends need that front-end installed: `pip install 'misaki[en]==0.9.4'`, the spaCy tagger model (`python -m spacy download en_core_web_sm`), and the **espeak-ng** system library (out-of-dictionary fallback). A missing piece raises a specific install hint at prepare. A *single* English voice (the named path) is unaffected — only English blends use this.

US English (`british=False`); GB-voice blends are a follow-up. The `misaki[en]` g2p identity folds into the segment cache key for English blends only, so existing caches (Chinese blends, named voices) are not invalidated.

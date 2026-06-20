---
'@glissade/narrate': patch
---

test(narrate): 0.14 misaki-zh de-risking SPIKE — KOKORO=1-gated probe confirming the kokoro-js tokenizer accepts misaki[zh]'s custom-IPA + arrow-tone alphabet (non-`<unk>` ids) and that `generate_from_ids` produces audio for a z* voice via the g2p bypass. Research only; the providers.ts z* hard-error floor is unchanged (Chinese-on-kokoro is not wired). Unblocks scoping the 0.15 zh engine.

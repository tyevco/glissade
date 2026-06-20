---
'@glissade/narrate': patch
---

0.15 canary fix (FIX 1 + FIX 3): harden the misaki[zh] g2p cache identity on the real `gs narrate` path.

`kokoroProvider.version()` now ALWAYS folds the misaki[zh] g2p identity, instead of gating it on a constructor `z*` voice. The CLI constructs `kokoroProvider()` with no opts (`providerById('kokoro')` / `synthesizeScript`) and routes Chinese per-REQUEST, so the gated suffix left a Mandarin segment's cache key carrying NO g2p identity — bumping the pinned wheel / jieba dict / `PHONEME_MAP_VERSION` left the key byte-identical and the segment cache served STALE Mandarin audio.

To make the unconditional fold free, `zhG2p.version()` is now PURE and Python-free: a pin-based identity string `misaki-zh misaki=<MISAKI_PIN> jieba=<JIEBA_PIN> map=<PHONEME_MAP_VERSION>` (no `spawnSync`, no file read, no `__version__` introspection). The pins are now ENFORCED at synth time: `phonemize()` resolves the installed versions via `importlib.metadata.version(...)` (authoritative dist-info, present even when a wheel exposes no `__version__` — as jieba historically does not) and raises an actionable `installed X != pinned PIN` error on a mismatch, instead of silently degrading to `'unknown'` (which let two divergent wheels collide). No evaluate()/golden bytes touched — prepare-time only.

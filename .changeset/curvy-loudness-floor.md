---
'@glissade/cli': patch
'@glissade/narrate': patch
---

Three small 0.13 cli/narrate consumer/canary fixes.

**Fix 1 — loudness publish gain can no longer overshoot the -1 dBTP ceiling.**
The committed gain was rounded to 2 decimals with `Math.round` (round-to-nearest),
which on a peak-clamp-bound mix could land the gain ~0.005 dB *above* the computed
clamp (e.g. -1.005 → -1.00), pushing the published true-peak over -1 dBTP. The
committed gain now uses `Math.floor` (floor-to-2-decimals), which is always ≤ the
computed clamp, so the publish guarantee holds.

**Fix 2 — `gs render --cache scene.js` no longer eats the scene path.**
`parseArgs` treated every non-`=` flag as value-taking, so the boolean `--cache`
greedily consumed the following positional. A `KNOWN_BOOLEAN_FLAGS` set (`record`,
`force`, `strict`, `cache`, `json`, `fix`, `no-warnings`, `lossless-intermediate`,
`allow-gpu-shards`, `verbose`, `allow-degraded`, `bisect`, `watch`) now prevents
boolean flags from consuming the next token. Use `--cache=<dir>` to set a custom
cache directory.

**Fix 3 — kokoro Chinese (z*) voices now hard-error instead of emitting garble.**
kokoro-js routes Chinese through espeak-ng `cmn`, not the misaki[zh] g2p the `z*`
voices were trained on (mismatched phonemes → garbled audio). `kokoroProvider`
now throws a clear `NarrationError` for any `zf_`/`zm_` voice, naming misaki[zh]
and pointing to `--provider piper` for Chinese. English voices are unaffected.

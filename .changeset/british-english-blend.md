---
'@glissade/narrate': minor
---

narrate: British English voice-blend dialect (`bf_`/`bm_`)

English Kokoro voice blends are no longer US-only. The dialect is inferred from the base-voice prefixes — American (`af_`/`am_`) → **US** English, British (`bf_`/`bm_`) → **GB** English — and threaded into `misaki[en]` (`G2P(british=True)` + `EspeakFallback(british=True)`).

```js
synthesizeScript(script, { providerImpl: kokoroProvider({ voice: { blend: [['bf_emma', 2], ['bm_george', 1]] } }) }); // GB
```

A blend mixing US and GB voices is rejected (different espeak front-ends, like a mixed-language blend), and the dialect folds into the segment cache key (`dialect=us`/`gb`) so US and GB renders never collide.

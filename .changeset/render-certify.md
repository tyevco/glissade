---
'@glissade/scene': minor
---

**0.62 `gs render --certify`** — the determinism certificate + a content-addressed render cache. Determinism-as-a-moat, made a product: a render is only cacheable-by-content if it's byte-deterministic, which glissade is (b4e6060006 held 0.20→0.61).

- **`certKey(scene, timeline)`** (on `@glissade/scene/diagnostics` + the `window.glissade` IIFE, `kind:'tool'`) — a pure semantic content-address computed WITHOUT rendering. It shares diff's exact canonical serialization (extracted into `canonicalScene.ts`), so `certKey(A) === certKey(B) ⟺ diff(A, B).empty` holds by construction — the cache key and the differ agree on scene identity, and `diff.empty ⟹ byte-identical` (a collision can't serve wrong bytes). SHA-256 (a 256-bit digest, because a false cache hit would serve wrong bytes).
- **`gs render --certify`** emits a per-frame Certificate manifest (`{certVersion, sceneHash, timelineHash, frameKey, narrationTimingHash, fontDigest, captionBurnMode, toolchainHash, backendHash, renderConfig, certHash}`) — the exact determinant set, hash-of-hashes, computable without rendering. The video-cert is PER-STREAM (separate from the audio-cert of narration/music/sfx/loudness), so an audio-only re-master doesn't bust the video frame cache (`video ≠ f(audio)`).
- **`gs render --cert-cache[=dir]`** — a local content-addressed frame cache: a HIT serves the pinned bytes (skips render), a MISS renders + stores. Proven byte-identical to a cold render.
- **`gs render --verify <cert>`** re-renders and asserts the byte-hash matches (self-verification = the determinism carry, keyed by cert); **`--verify-cache --sample n`** spot-audits cached entries.

Additive/opt-in: all 415 goldens byte-identical (the render path is untouched; `diff.ts` was refactored to share the canonicalization with no output change), base embed unchanged (38.67/39), determinism b4e6060006 held.

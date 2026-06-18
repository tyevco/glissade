---
'@glissade/export-web': patch
---

Add `MediabunnyVideoFrameSource.cachedFrameCount()` — a tiny test-only
introspection accessor returning the number of decoded frames currently held,
so the §5.4 lookahead/eviction bound (`MAX_CACHED_FRAMES`) is assertable without
reaching into the private cache. Behavior is otherwise unchanged (F2IP export
determinism backfill).

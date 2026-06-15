---
'@glissade/export-web': minor
---

Add `probeExportSupport()` (§5.2): returns the resolved encodability matrix (`{ format, video, audio, supported }` per container) so a UI can grey out unsupported options instead of failing mid-render. And `exportVideo` no longer rejects the whole format when audio can't encode — it falls back to **video-only** (with a dev warning), matching Safari 16.4–18.x being video-only. Codec selection is now an exported, probe-injectable `pickCodecs` so the fallback logic is testable without WebCodecs.

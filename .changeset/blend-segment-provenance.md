---
'@glissade/narrate': patch
---

narrate: record per-segment voice provenance in the timing manifest (blend artifact auditability, gh#2)

Each `TimedSegment` now carries an optional `voice` field recording the RESOLVED
voice identity that produced its audio: a named voice records its name (e.g.
`"zf_xiaoxiao"`); a blend records its canonical `blendIdentity()` recipe
(`blend=[zf_xiaoni:0.650000,zf_xiaoxiao:0.350000 lang=zh v1]` — normalized
weights + base names + language + BLEND_SPEC_VERSION). Optional/additive: omitted
when a segment used the provider/script default with no explicit voice. Lets you
audit, from the committed `timing.json`, which voice/blend produced each segment
(a script may use different blends per segment, which the script-level
`providerVersion` cannot capture). No cache-key change — invalidation was already
correct via `voiceCacheIdentity`.

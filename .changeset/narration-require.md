---
'@glissade/narrate': minor
---

`narration(timing).require([ids])` — a build-time fast-fail that asserts every referenced beat id exists in the manifest, throwing ONE error listing ALL unknown ids at once (e.g. after rewiring/splitting segment ids, instead of discovering stale refs one render at a time). Returns the anchors, so it chains: `const beats = narration(timing).require(['intro', 'beat', 'outro'])`. The error lists the available ids, like the per-lookup message.

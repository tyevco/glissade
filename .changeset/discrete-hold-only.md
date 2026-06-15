---
'@glissade/core': patch
---

`validateTrack` now canonicalizes non-hold keys on discrete (`string` / `boolean`) tracks to explicit holds. These types are hold-only by construction (their `lerp` already snaps), so this is behaviorally a no-op — but it makes the serialized document honest and stops a curve editor from offering a meaningless ease on a discrete track.

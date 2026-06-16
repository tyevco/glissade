---
'@glissade/core': minor
'@glissade/vite-plugin': patch
---

Reshape the editor sidecar to `sidecarVersion: 2` (§6.2) — the foundation for safe code↔editor round-tripping. Edits are now namespaced by timeline id (`'main'` for the linear timeline; v2 machines add more), tracks are keyed by canonical target and carry the code `baseHash` they branched from, keys get stable `k<N>` ids, and tracks whose target drifted are parked as `orphans` (with a reason) instead of failing to bind the whole overlay. New core API: `migrateSidecar` (lifts v1 documents forward on load), `setSidecarTrack` (the studio write path, assigns key ids + baseHash), `mergeSidecarDetailed` (returns the bindable timeline + drift list + orphans), `hashKeys`, `assignKeyIds`. `mergeSidecar` keeps returning a bindable `Timeline` and now accepts v1 or v2 input. The studio and vite-plugin read/write v2 (v1 files migrate automatically). The drift-badge / orphan-relink studio UI is a follow-up.

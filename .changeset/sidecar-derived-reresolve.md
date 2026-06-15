---
'@glissade/core': patch
---

`mergeSidecar` now re-resolves `derived:true` leading keys against the merged track (§2.6): a derived from-key duplicates the preceding key's held value, so an upstream edit (a sidecar that bumped the prior key) flows into it instead of leaving a stale value that pops at the segment start. Build-time derived keys are already correct; this only touches the ones an edit moved beneath.

---
'@glissade/core': patch
---

Enforce the editable-host rule on track targets (§6.4/§6.5, the structural-id guards): a structural `~Type.ordinal` string target is now rejected at track creation (`UnresolvableTargetError` — structural ids are inspection-only, never track targets), and `.editable()` on a target lacking an explicit node id throws a clear `TimelineValidationError`. Both share the single `isEditableNodeId` predicate, now exported from core (alongside `targetNodeId`) and consumed by the builder, the scene, and the studio host. (The `~Type.ordinal` structural-id *generator* was dropped per the 0.9 design lock; only the guards remain.)

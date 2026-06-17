---
'@glissade/core': minor
---

feat(core): studio edit-gating + write-back helpers (§6.2)

Adds the core surface the studio needs to gate GUI edits and offer the
hybrid write-back affordances (the `isEditableNodeId` predicate ships
separately):

- `editableDuration()` on `TimelineBuilder` + `isDurationEditable(doc)` — opt
  the (otherwise code-owned) timeline duration into studio editing, mirroring
  `.editable()` for tracks. Backed by an additive optional
  `Timeline.editableDuration` field; existing documents are unaffected.
- `deleteSidecarTrack(doc, timelineId, target)` — remove one editor-owned
  track from the sidecar (§6.2 rule 7 "extract edits to code"), returning a new
  document and never mutating the input. Source is never touched.

All additive; no existing document changes shape or renders differently.

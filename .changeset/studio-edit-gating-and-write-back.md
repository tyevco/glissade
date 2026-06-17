---
'@glissade/core': minor
---

feat(core): studio edit-gating + write-back helpers (§6.2)

Adds the core surface the studio needs to gate GUI edits and offer the
hybrid write-back affordances:

- `isEditableNodeId(id)` — the locked node half of the editability rule
  (§6.2 sub-decision, §6.5): true only for an explicit, stable id; the
  `~Type.ordinal` structural fallback and the `__root` sentinel are never
  editable.
- `editableDuration()` on `TimelineBuilder` + `isDurationEditable(doc)` — opt
  the (otherwise code-owned) timeline duration into studio editing, mirroring
  `.editable()` for tracks. Backed by an additive optional
  `Timeline.editableDuration` field; existing documents are unaffected.
- `deleteSidecarTrack(doc, timelineId, target)` — remove one editor-owned
  track from the sidecar (§6.2 rule 7 "extract edits to code"), returning a new
  document and never mutating the input. Source is never touched.

All additive; no existing document changes shape or renders differently.

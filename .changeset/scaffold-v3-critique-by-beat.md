---
'@glissade/cli': minor
---

`gs critique --by-beat <scene-module> --timing <narration.timing.json>`: the same
rendered diagnostics `gs critique` produces, GROUPED by the narration beat that
owns each flagged node. A node's owning beat is the committed
`narration.timing.json` segment window `[start, start+duration)` that CONTAINS the
node's ENTRANCE (the minimum keyframe time across its own tracks); the window is
half-open, so an entrance exactly on a segment's end belongs to the NEXT beat (one
canonical owner, no double/no-gap). A keyframeless node, or one whose track span
covers the whole timeline (a full-duration backdrop / persistent caption), routes
to an explicit `[likely FRAME-owned]` group — NEVER a silent seg-0 bucket, so the
author is sent to the FRAME config rather than the wrong body beat. Node-less
diagnostics collect under a `static (no node)` group.

The report is escalate-boundary-aware: geometry-class fix levers are presented as
an auto-`suggested fix`, content-class levers as an `author decision (meaning)`
that must never be auto-applied. The command is NON-MUTATING (a report only, it
never edits the scene) and DETERMINISTIC — a pure function of (scene, timeline
tracks, `timing.json`) with a fixed canonical order (segments in manifest order,
then the spans group, then static; node id then diagnostic code within a group),
so it is byte-identical run-to-run. `--json` emits the structured
`{ byBeat, spans, static }` shape; `--by-beat` without `--timing` fails loud. CLI-
only — zero scene change, off the render path.

---
'@glissade/cli': patch
---

`gs critique --by-beat`: split the single spans fallback into TWO honest buckets, so
a keyframeless node is no longer over-claimed as frame art. A FULL-DURATION SPAN
node (entrance defined AND its track span covers the whole timeline) stays in the
`[likely FRAME-owned]` `spans` group — the genuine backdrop / persistent-caption
signal. A KEYFRAMELESS node (a flagged node with no tracks → no entrance keyframe to
time-attribute) now routes to a new `[no entrance keyframe]` `unattributed` group.

This is the anti-workslop correction: a keyframeless node is more likely a
statically-pushed BODY node than frame art, so tagging it `[likely FRAME-owned]`
was a confident mis-route that would send the author to the FRAME config instead of
the body. `unattributed` makes no ownership claim — it honestly says the node
couldn't be time-attributed (locate it by node id, shown on each diagnostic line).
Canonical section order is now beats (segment order) → spans → unattributed →
static; the `--json` shape gains an `unattributed` array. Both marker literals are
pinned exact (`[likely FRAME-owned]`, `[no entrance keyframe]`). Still CLI-only,
non-mutating, deterministic; zero scene change.

---
'@glissade/scene': patch
---

critique `alignGroups`: fail loud with the RIGHT cause when a member has no own rendered box. A member that never produces a draw command — a container `Group`, or a fill-less / hidden leaf — now throws a `CritiqueError` naming the real cause ("member 'X' produced no rendered box across the timeline — it is likely a container Group … declare its leaf node ids"), matching Cut-1's `containBounds` verbatim, instead of the misleading "no settled frame" (which blamed a *timing* problem on a fully-static member and sent authors chasing a non-existent settle issue). "No settled frame" is now reserved for genuinely-never-still *drawn* members. Three-seat measured on 0.78.0-pre.0 (a static container-Group member + a fill-less leaf both misdiagnosed). The composed-children-box resolution (declare the natural Group id) lands in Cut 3.

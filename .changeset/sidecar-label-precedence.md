---
'@glissade/core': patch
---

Sidecar label merge precedence is fixed: **code labels now win on a name collision** (§6.2), with a dev warning naming the shadowed sidecar label(s). Previously the editor sidecar's label silently overrode the code-authored one — the opposite of the decided rule that code labels are authoritative and the editor label is flagged for rename.

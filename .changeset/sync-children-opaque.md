---
'@glissade/core': patch
---

`sync` timeline children are now properly opaque: a sync child that animates the same target as the parent (or another sync child) raises a `TimelineValidationError` instead of silently coalescing last-writer-wins. The previously-dead `opaque` flag becomes a load-bearing per-unit id in the compiler. `add` children still flatten and coalesce against the parent as before, and a sync child with disjoint targets still appears in `compiled.tracks` under its own target. Fixes a §2.3 nesting-model violation.

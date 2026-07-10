---
'@glissade/scene': patch
---

critique `containBounds`: fail loud on an unresolvable `node`, instead of silently guarding nothing. The box half already fails loud (`validateRegion` on `within`); the node half now matches, via a new instanceof-catchable `CritiqueError`. An unknown / typo'd id (matches no node in the scene) throws at ingest; a container `Group` id (indexed but with no own rendered box) throws after the sample pass — declare its leaf node ids instead. A declared keep-within box that silently no-ops is the confident-wrong-by-omission the critique suite exists to prevent (an author who added a guard would be worse off than one who knew they had none). Three-seat converged (content / determinism / surface). `CritiqueError` is exported from `@glissade/scene/diagnostics`.

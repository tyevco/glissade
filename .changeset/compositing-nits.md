---
"@glissade/scene": patch
---

Compositing polish: `trackMatte` fails loud on an invalid mode; `describe()` reports clip's real shape

Two canary nits from 0.34.0-pre.0 validation:

- **`trackMatte({ mode })`** now throws at construction on any mode other than `'alpha'` / `'luma'` (*"trackMatte mode must be 'alpha' or 'luma', got …"*) — the fail-loud discipline the rest of the compositing/Chart/scale API follows. Previously a typo'd `'lumaa'` rode into the IR and the backend silently rendered it as `alpha` (wrong output, no error), which both the render and no-build seats caught.
- **`describe().nodes.Group.props.clip.type`** now reports the actual shape `{ w, h, r?, x?, y? } | PathSeg[]` instead of the opaque `ClipRegion`, matching how `anchor` reports its enumerated shape rather than `AnchorSpec` — so an author reading the manifest can't mistake the type name for a constructor. `ClipRegion` remains a TS-only export for typed config.

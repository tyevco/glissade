---
'@glissade/core': minor
'@glissade/scene': minor
'@glissade/browser': minor
---
feat(core,scene,browser): `glissade.describe()` — a machine-readable API manifest

`describe()` returns a structured, JSON-serializable manifest of the public API —
the structural antidote to discoverability, so an AI consumer reads GROUND TRUTH
from the artifact instead of reverse-engineering the surface. It is PURE
INTROSPECTION (instantiate each built-in node once, read its registered targets,
enumerate the core registries); zero `evaluate()`/determinism impact — every
golden is byte-identical.

The manifest is GENERATED from the live registries it documents, so it can't
drift from the real API:

- `nodes[*].props[*]` — the animatable track targets per node type, each with its
  value type + arity, read from the REAL `registerTarget` calls via the new
  `Node.listTargets()` (e.g. `position: { type:'vec2', animatable:true,
  target:'<id>/position', arity:2 }`, `fill: { type:'color|paint' }`,
  `Text.reveal: { type:'number' }`).
- `valueTypes` — from the new `listValueTypes()` over the core ValueType registry.
- `easings` — from the core easing registry.
- `builder` / `createScene` / `subpaths` — curated, with a test pinning the
  builder names to the live `TimelineBuilder` surface.

`describe()` lives on the tree-shakeable `@glissade/scene/describe` subpath (off
the base embed — base embed path unchanged), and is re-exported on the
`@glissade/browser` bundle as `window.glissade.describe()`. The browser build also
emits a committed `dist/glissade.api.json` (= `JSON.stringify(describe())`) so a
tool can fetch the manifest without running JS.

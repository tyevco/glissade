---
"@glissade/scene": minor
"@glissade/browser": minor
---

0.20: `describe()` helpers section (createPlayer/motionPath/clip/renderToDataURL/splitText)

`glissade.describe()` already surfaced nodes, props, value types, easings, the
timeline builder, `createScene`, and the tree-shakeable subpaths — but NOT the
broader helper/factory API. An AI/agent consumer that discovers the surface by
introspecting the manifest (not the website) would never find `createPlayer`,
`motionPath`/`followPath`, `clip`/`clipList`, `renderToDataURL`/`snapshotCanvas`,
or `splitText`, even though all of them work.

The manifest now carries a curated **`helpers`** array (`ApiManifest.helpers:
DescribedHelper[]`), one entry per helper with a `name` (also the
`window.glissade.<name>` global on the IIFE), a one-line `summary`, the npm
`import` subpath, and a minimal `usage` string. Copy is kept verbatim with
`docs/discovery.md`.

`scene` can't import `player`/`backend-canvas2d` (they live above it in the dep
graph), so this is a hand-kept literal — drift-guarded two ways: scene's
`describe.test.ts` pins the structure + the npm import paths, and
`@glissade/browser`'s smoke test (above scene, importing the whole IIFE surface)
asserts every `describe().helpers[*].name` resolves to a real
`window.glissade.<name>` function.

`describe` stays on the tree-shaken `@glissade/scene/describe` subpath, so the
base embed is unchanged (34.93 kB gz). The committed `glissade.api.json` is
regenerated to include the new section.

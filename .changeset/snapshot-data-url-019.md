---
'@glissade/backend-canvas2d': minor
'@glissade/browser': minor
---

0.19: snapshot a rendered frame as a data URL — on a tree-shakeable subpath. A
new `@glissade/backend-canvas2d/snapshot` entry exports `snapshotCanvas(canvas |
Canvas2DBackend, type?, quality?)` — `async`, captures the canvas as a
`data:image/png;base64,…` string via `OffscreenCanvas.convertToBlob` (falling
back to `HTMLCanvasElement.toDataURL`) — and a top-level `renderToDataURL(scene,
timeline, t)` convenience that allocates an offscreen target sized to the scene,
runs `evaluate → render → snapshotCanvas`, and returns the data URL in one call.
It mirrors the `evaluate` overload pair: pass a timeline + time, or omit both
for the controlled-drive form (`renderToDataURL(scene)` at the scene's current
playhead). An optional `{ type, quality }` bag picks the encoding (default
`image/png`).

This is the "screenshot a frame" DX seam an AI consumer hit (`can't screenshot
a live canvas`). It is DX/screenshot TOOLING — a no-build playback embed never
needs it — so it lives on a SEPARATE subpath (mirroring `@glissade/scene/path`),
fully tree-shaken off the base `@glissade/backend-canvas2d` index and thus the
base embed budget; a check:size guard asserts the base index excludes the
data-URL/encode code. Browser-only by design — `OffscreenCanvas`/`toDataURL`;
the headless byte-exact path stays the Skia backend / `gs render` CLI. Importing
the subpath in a headless Node env never throws; the browser-only constraint is
enforced at call time. `renderToDataURL` (+ `snapshotCanvas`) is re-exported
from `@glissade/browser` so it lands on `window.glissade.renderToDataURL` for
no-build use.

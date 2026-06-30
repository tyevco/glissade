# @glissade/backend-dom

A **DOM/SVG render backend** for glissade: it consumes the identical `DisplayList`
IR the canvas2d/skia backends consume, but emits **HTML/SVG elements** instead of
pixels.

> **Preview / non-parity.** There is no canvas, so neither Skia byte-exactness nor
> browser↔Skia SSIM applies — this backend is **never on the `gs render` export
> path**. Its value is elsewhere: accessibility + selectable text, CSS-native
> embedding, and a zero-raster structural preview you can click into. Export stays
> on the raster path (canvas2d/Skia → WebM/MP4); this is the **edit / inspect /
> a11y** tier.

## Usage

It is a passive `RenderBackend` sink — your host owns the clock. Swap the backend
factory; the [controlled-drive](../../docs/controlled-drive.md) loop is otherwise
unchanged:

```js
import { DomBackend } from '@glissade/backend-dom';

const backend = new DomBackend(document.getElementById('stage')); // a host element
function frame(t) {
  for (const m of movements) m.run(t);             // your signals, your clock
  backend.render(evaluate(scene));                  // paint current values
}
```

### Node identity (`data-node-id`) — for click-to-edit

Identity rides **out-of-band** (the `DisplayList` stays identity-less). Feed the
backend the id stream from [`@glissade/scene/identity`](../scene)'s `emitWithIds`
and it stamps `data-node-id` on each node's element:

```js
import { emitWithIds } from '@glissade/scene/identity';

function frame(t) {
  for (const m of movements) m.run(t);
  const { displayList, ids } = emitWithIds(scene, EMPTY, t);
  backend.setIds(ids);          // positional id stream (off by default)
  backend.render(displayList);
}
```

> **A node may stamp `data-node-id` on more than one element.** Identity is
> stamped per emitted command, so a node's transform wrapper *and* its content
> element (the `<svg>`/text `<div>`) both carry the id. Use `el.closest('[data-node-id]')`
> for hit-testing (the editing contract — it resolves to the nearest tagged
> element regardless); if you build a node→element MAP, `querySelectorAll('[data-node-id="x"]')`
> returns more than one element per node, so dedupe by id (or key off the outer
> wrapper).

Then the DOM is your **interaction surface** while the scene graph stays the single
source of truth — read identity, mutate the scene, never write the DOM back:

```js
stage.addEventListener('click', (e) => {
  const el = e.target.closest('[data-node-id]');
  if (!el) return;
  const node = scene.nodes.get(el.dataset.nodeId);
  node.text.set('edited');     // → the next render reflects it (one-way: scene → DOM)
});
```

> **One `emitWithIds()` feeds BOTH `setIds` and `render`.** The id stream is
> positional by command index, so `setIds(...)` and `render(...)` must come from
> the *same* emit — `setIds(emitWithIds(sceneA, …).ids)` then
> `render(evaluate(sceneB, …))` silently mis-maps `data-node-id`. Always destructure
> one call: `const { displayList, ids } = emitWithIds(scene, tl, t)`.

## No-build (`<script src>`)

The DOM tier ships as a separate **optional** IIFE, `glissade-dom.browser.js`, a
second `<script>` loaded *after* the base bundle — it augments `window.glissade`
with `DomBackend` + `emitWithIds` (the base playback bundle stays lean and
`DomBackend`-free):

```html
<script src="https://unpkg.com/@glissade/browser/dist/glissade.browser.js"></script>
<script src="https://unpkg.com/@glissade/browser/dist/glissade-dom.browser.js"></script>
<script type="module">
  const backend = new glissade.DomBackend(document.getElementById('stage'));
  function frame(t) {
    for (const m of movements) m.run(t);
    const { displayList, ids } = glissade.emitWithIds(scene, EMPTY, t); // ONE emit
    backend.setIds(ids);
    backend.render(displayList);
  }
</script>
```

Load order is fail-loud: `glissade-dom.browser.js` throws a clear error if the
base bundle is absent or a different version (never a cryptic `undefined`).

## What it maps

| IR op | DOM/SVG |
|---|---|
| `transform` / `save` / `restore` | nested `<div>` with a CSS `matrix(...)` |
| `pushGroup` / `popGroup` | nested `<div>` with `opacity` / `mix-blend-mode` / `filter` |
| `fillPath` / `strokePath` | inline `<svg><path>` (full `M/L/C/Q/E/Z`, `E`→ SVG arc) |
| `fillText` | a positioned `<div>` with **real, selectable** text |
| `clip` | an SVG `<clipPath>` + a `clip-path: url(#…)` wrapper |
| `drawImage` | an `<img>` at the dst box |
| linear/radial gradient | `<linearGradient>` / `<radialGradient>` defs |

### Documented divergences (preview/non-parity)

- **Text line-breaking** uses the browser's layout engine, so it can differ from
  the canvas/Skia rasterizer (intended). The measuring span is mounted in the live
  document so wrapping reflects the real font (a detached host would measure 0).
  **Web fonts load async**, so text first measured before its font loads wraps on
  the fallback estimate. Pass **`onReflow`** and re-render in it — the backend
  fires it when `document.fonts` becomes ready (and on later `@font-face` batches),
  so the host re-evaluates and text re-wraps with the loaded font:

  ```js
  const backend = new DomBackend(stage, { onReflow: () => frame(currentTime) });
  ```
- **`measureText`** measures `width` via a hidden DOM element (matching what this
  backend draws). `ascent`/`descent` are **estimates** (`0.8`/`0.2 × fontSize`),
  not real font metrics — fine for layout composition, not for exact vertical
  metrics. With no layout engine (e.g. jsdom) `width` also falls back to an
  estimate and warns once.
- **Mesh paints, gaussian/smooth gradient interpolation, and exact blend
  isolation** have no CSS/SVG analogue — they **degrade to a best-effort solid /
  linear** and the element is stamped **`data-approx="true"`** so an editor can
  badge it. Shader (`pushGroup.shader`) passes are ignored (`caps.shaders=false`).
- **`readPixels()` rejects** (it is `async` — there is no pixel buffer). It
  returns a `Promise` per the `RenderBackend` contract, so **`await` it or use
  `.catch()`** — a bare synchronous `try/catch` will not see the rejection. Use
  canvas2d/skia for real pixel readback.

The backend only ever manages its **own root** subtree — your overlay/foreign DOM
in the host element is left untouched.

## Status: Stage S2 (forward render)

Today this is a **forward renderer**: each `render()` rebuilds the tree. That is
right for **playback preview, structural snapshots, and a11y reads**. The
**retained-DOM reconciler** (reuse + patch the same element per `data-node-id`
across frames — required so an in-progress inline-edit caret, selection, focus,
and event listeners survive a re-render) is **Stage S3**, a follow-up. See
`docs/design/dom-backend.md`.

# The single-file browser bundle

`@glissade/browser` is a prebuilt, single-file IIFE of glissade's realtime embed path — **core + scene + Canvas2D backend + player + the `<gs-player>` element**, all in one minified `.js`. No bundler, no `npm install`, no build step: drop one `<script src>` on a page and the whole realtime authoring surface is on `window.glissade`.

It's the same code as the scoped `@glissade/*` packages, just bundled for `<script>` use. If you already have a build pipeline (Vite, esbuild, etc.), import the scoped packages directly instead — this bundle exists for the no-build case.

## Loading

Serve the file from anywhere (it's fully offline — one file, no network deps) and load it:

```html
<script src="glissade.browser.js"></script>
<script>
  const G = window.glissade; // ~197 names: evaluate, createScene, timeline, mount, Canvas2DBackend, GsPlayerElement, …
</script>
```

Loading the script **auto-registers `<gs-player>`** — the `@glissade/element` module runs `customElements.define('gs-player', …)` at load. You don't call anything to register it.

### Where to get the file (versions & channels)

The bundle ships on npm as `@glissade/browser`, so any npm CDN serves it as one `<script src>`-able file. Pick the URL by how pinned you want to be:

```
# track the STABLE channel (auto-updates to the newest @latest release)
https://cdn.jsdelivr.net/npm/@glissade/browser@latest/dist/glissade.browser.js

# track the PRE-RELEASE channel (auto-updates to the newest @pre — e.g. a 0.X.0-pre.N)
https://cdn.jsdelivr.net/npm/@glissade/browser@pre/dist/glissade.browser.js

# PIN an exact version (fully reproducible)
https://cdn.jsdelivr.net/npm/@glissade/browser@0.17.1/dist/glissade.browser.js
```

`unpkg.com/@glissade/browser@<tag-or-version>/dist/glissade.browser.js` works identically. Each GitHub Release also attaches the file as an asset (`https://github.com/tyevco/glissade/releases/download/v<version>/glissade.browser.js`) — note that asset URL is **version-specific** (the tag is in the path), and `/releases/latest/download/` follows the latest **stable** release only (not pre-releases). For a single URL that tracks pre-releases, use the CDN `@pre` tag above. *(CDN dist-tag resolution caches briefly, so a brand-new publish can take a few minutes to appear on the `@latest`/`@pre` URLs.)*

For the **offline single-file** case, fetch one of these once at build time and inline the contents into your `<script>` — the bundle has no runtime network dependency.

## Two ways to render

### 1. The lean own-rAF path

If you want full control of the frame loop, drive the Canvas2D backend yourself. `evaluate(scene, timeline, t)` is a pure function of time, so a frame is just "evaluate, then render":

```js
const G = window.glissade;
const canvasEl = document.querySelector('canvas');

// NOTE: Canvas2DBackend takes the CANVAS ELEMENT, not a 2d context.
const backend = new G.Canvas2DBackend(canvasEl);

// Nodes take `position:[x,y]` + `size:[w,h]`, under `children`.
const scene = G.createScene({
  size: { w: 640, h: 360 },
  children: [new G.Rect({ id: 'box', position: [80, 140], size: [80, 80], fill: '#89b4fa' })],
});
scene.setTextMeasurer(backend); // the backend supplies text metrics to scene

// Animation is data — the builder compiles to a serializable Timeline document.
// Builder: to(target, value, opts) and fromTo(target, from, to, opts); `ease` is a FUNCTION.
// Options are strict: an unknown opts key throws a TimelineValidationError naming it.
// See the per-method known-key reference in ./timeline.md ("Options are strict").
const timeline = G.timeline((tl) => {
  tl.fromTo('box/position', [80, 140], [480, 140], { duration: 2, ease: G.easings.cubicInOut });
});

function frame(tMs) {
  const t = (tMs / 1000) % 2; // you own the clock
  backend.render(G.evaluate(scene, timeline, t)); // evaluate = pure fn of time → render
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

> Want to own the **values** too — drive nodes imperatively with `node.set(...)`
> and no timeline at all (a physics loop, a game state machine, an imperative
> port)? Call `G.evaluate(scene)` (the no-timeline overload) per frame. See
> [Controlled / imperative drive](./controlled-drive).

### 2. The `<gs-player>` element (auto-registered)

For play/pause/scrubber chrome and a managed loop, assign a scene module to the element — no JS frame loop of your own:

```html
<gs-player controls loop autoplay></gs-player>
<script src="glissade.browser.js"></script>
<script>
  document.querySelector('gs-player').scene = {
    createScene: () => window.glissade.createScene(/* … */),
    timeline: /* a Timeline document */,
  };
</script>
```

`controls`, `loop`, `pingpong`, and `autoplay` are attributes; `scene` is a property (scene structure is code — there is no URL loading). `loop` restarts at the end; `pingpong` (alias `yoyo`) plays the timeline forward then backward, ping-ponging (the player's alternate loop mode). Default controls (play/pause, scrubber, time readout) are themable via CSS parts (`controls`, `button`, `scrubber`, `time`).

```html
<!-- ping-pong (yoyo) playback instead of a hard restart -->
<gs-player controls pingpong autoplay></gs-player>
```

## Paths from an SVG `d` string

`Path.data` wants the verbose `PathValue` contour form — but you can build one from a raw SVG path `d` string with `pathFromSvg`, handy for icon-style arrowheads and glyph outlines. In the single-file bundle it's on `window.glissade` (`G.pathFromSvg`):

```js
var arrow = new G.Path({
  id: 'arrow',
  data: G.pathFromSvg('M0 0 L40 0 M28 -8 L40 0 L28 8'), // SVG `d` → PathValue
  stroke: '#cdd6f4',
  position: [200, 180],
});
```

The parser is **off the base embed** — it lives on the tree-shakeable `@glissade/scene/path` subpath (`import { pathFromSvg } from '@glissade/scene/path'` when bundling), so a no-build embed that never touches SVG strings doesn't pay for it. Passing a bare string straight to `Path.data` throws a clear construction-time error naming `pathFromSvg`; a non-`PathValue` `data` (e.g. a number) does too, rather than crashing at render.

The lean parser covers `M L H V C Q Z` (absolute + relative). For the full SVG command set (`S`/`T`/`A` smooth-curves + arcs), import a `.svg` file through `@glissade/svg` with a build toolchain.

## FOUT caveat (own-rAF consumers)

Web fonts load asynchronously: a frame drawn before the face is ready uses a fallback, then text reflows when the real face arrives (a flash of unstyled text). The managed `mount()` / `<gs-player>` path **auto-repaints when a font face loads**. If you run your own rAF loop, that's on you — wait for fonts (or repaint after they land):

```js
document.fonts.ready.then(() => {
  // re-measure + repaint now that web fonts are available
  backend.render(G.evaluate(scene, timeline, performance.now() / 1000));
});
```

## Snapshot a frame as a data URL

Need to *capture* a rendered frame — a thumbnail, a test fixture, or a screenshot a tool can read — rather than just paint it to a live canvas? `renderToDataURL` evaluates a frame, renders it on an offscreen canvas, and returns a `data:image/png;base64,…` string in one call (`G.renderToDataURL` on the bundle). It returns a **`Promise<string>` — `await` it** (offscreen serialization is async); logging the call without awaiting yields `[object Promise]`, not the URL:

```js
const url = await G.renderToDataURL(scene, timeline, 0.5); // frame at t=0.5s
// → "data:image/png;base64,iVBORw0KGgo…"  (drop into an <img src>, POST it, diff it)
```

It allocates its own offscreen target sized to the scene, so you don't need a `<canvas>` in the page. The no-timeline (controlled-drive) overload works too — `await G.renderToDataURL(scene)` snapshots the scene at its current playhead. An optional final `{ type, quality }` bag picks the encoding (default `image/png`):

```js
const webp = await G.renderToDataURL(scene, timeline, 0.5, { type: 'image/webp', quality: 0.9 });
```

On the single-file `window.glissade` bundle this is just `G.renderToDataURL`. With an **npm** build it lives on a tree-shakeable subpath — `@glissade/backend-canvas2d/snapshot` — so a playback-only embed never pays for the data-URL encode bytes; import it explicitly:

```js
import { renderToDataURL, snapshotCanvas } from '@glissade/backend-canvas2d/snapshot';
```

If you already hold a `Canvas2DBackend` over a live canvas, `await snapshotCanvas(backend)` captures whatever it last rendered (same `{ type, quality }` args; you can also pass a raw `HTMLCanvasElement`/`OffscreenCanvas`). Both are **async** (offscreen serialization is `OffscreenCanvas.convertToBlob`, falling back to `HTMLCanvasElement.toDataURL`).

> **Browser-only.** `renderToDataURL` / `snapshotCanvas` rely on the browser canvas (`OffscreenCanvas` / `toDataURL`); they are not for Node. The headless, byte-exact path is the Skia backend / `gs render` CLI — see the export docs.

## What is NOT in this bundle

This is the **realtime** surface only. It deliberately excludes:

- **the CLI (`gs`) and the Skia backend** — the headless, byte-exact render path used for video export;
- **the WebCodecs/ffmpeg export path** — offline video encode;
- **studio** — the editor;
- **`effects-webgpu`** — shader effects (outside the determinism guarantee).

Those are export/desktop-only and don't affect realtime authoring in the browser. If you need them, use the scoped packages with a real toolchain.

## Complete standalone example

A single self-contained file — a `<canvas>`, a tiny scene + timeline in plain ES2017, and the lean draw loop. Save as `hello-world.html` next to `glissade.browser.js` and open it:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>glissade — hello world</title>
    <style>
      body { margin: 0; display: grid; place-items: center; min-height: 100vh; background: #111; }
      canvas { background: #1e1e2e; border-radius: 8px; }
      .row { position: fixed; bottom: 16px; display: flex; gap: 8px; align-items: center; color: #ccc; font: 13px system-ui; }
    </style>
  </head>
  <body>
    <canvas id="stage" width="640" height="360"></canvas>
    <div class="row">
      <button id="toggle">play / pause</button>
      <input id="scrub" type="range" min="0" max="1" step="0.001" value="0" style="width:280px" />
      <span id="t">t=0.00</span>
    </div>

    <script src="glissade.browser.js"></script>
    <script>
      var G = window.glissade;
      var canvasEl = document.getElementById('stage');

      // Scene: nodes take `position:[x,y]` + `size:[w,h]` (Rect/Text/…), under `children`.
      var scene = G.createScene({
        size: { w: 640, h: 360 },
        children: [
          new G.Rect({ id: 'box', position: [80, 140], size: [80, 80], fill: '#89b4fa', cornerRadius: 10 }),
          new G.Text({ id: 'label', position: [80, 250], text: 'glissade', fontSize: 28, fill: '#cdd6f4', fontFamily: 'system-ui, sans-serif' }),
        ],
      });

      // Canvas2DBackend takes the CANVAS ELEMENT (it grabs the 2d context itself).
      var backend = new G.Canvas2DBackend(canvasEl);
      scene.setTextMeasurer(backend); // canvas-native measureText — correct text layout, no Node

      // Animation is DATA: the builder compiles to a serializable doc; nothing runs at play time.
      // Builder: to(target, value, opts) and fromTo(target, from, to, opts); `ease` is a FUNCTION.
      var DURATION = 2;
      var timeline = G.timeline(function (tl) {
        tl.fromTo('box/position', [80, 140], [480, 140], { duration: DURATION, ease: G.easings.cubicInOut });
      });

      // FOUT: on the lean own-rAF path YOU repaint when fonts arrive (only mount() auto-repaints).
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { draw(playhead); });

      var playhead = 0, playing = true, last = null;
      function draw(t) {
        backend.render(G.evaluate(scene, timeline, t)); // evaluate = pure fn of time → render
        document.getElementById('scrub').value = String(t / DURATION);
        document.getElementById('t').textContent = 't=' + t.toFixed(2);
      }
      function frame(ms) {
        if (playing) {
          if (last != null) playhead = (playhead + (ms - last) / 1000) % DURATION;
          last = ms;
          draw(playhead);
        } else { last = ms; }
        requestAnimationFrame(frame);
      }
      // your own scrubber drives the playhead; persist to localStorage as you like
      document.getElementById('scrub').addEventListener('input', function (e) {
        playing = false; playhead = e.target.value * DURATION; draw(playhead);
      });
      document.getElementById('toggle').addEventListener('click', function () { playing = !playing; });
      requestAnimationFrame(frame);
    </script>
  </body>
</html>
```

> The `createScene` / `Rect` / `timeline` shapes above are the verified `window.glissade.*` API (identical to the scoped packages). See [Getting started](/getting-started) and [Concepts](/concepts) for the full signatures.

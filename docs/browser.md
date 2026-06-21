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

## Two ways to render

### 1. The lean own-rAF path

If you want full control of the frame loop, drive the Canvas2D backend yourself. `evaluate(scene, timeline, t)` is a pure function of time, so a frame is just "evaluate, then render":

```js
const G = window.glissade;
const canvasEl = document.querySelector('canvas');

// NOTE: Canvas2DBackend takes the CANVAS ELEMENT, not a 2d context.
const backend = new G.Canvas2DBackend(canvasEl);

const scene = G.createScene(/* … */);
scene.setTextMeasurer(backend); // the backend supplies text metrics to scene

function frame(tMs) {
  const t = tMs / 1000;
  backend.render(G.evaluate(scene, scene.timeline ?? timeline, t));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

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

`controls`, `loop`, and `autoplay` are attributes; `scene` is a property (scene structure is code — there is no URL loading). Default controls (play/pause, scrubber, time readout) are themable via CSS parts (`controls`, `button`, `scrubber`, `time`).

## FOUT caveat (own-rAF consumers)

Web fonts load asynchronously: a frame drawn before the face is ready uses a fallback, then text reflows when the real face arrives (a flash of unstyled text). The managed `mount()` / `<gs-player>` path **auto-repaints when a font face loads**. If you run your own rAF loop, that's on you — wait for fonts (or repaint after they land):

```js
document.fonts.ready.then(() => {
  // re-measure + repaint now that web fonts are available
  backend.render(G.evaluate(scene, timeline, performance.now() / 1000));
});
```

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
    </style>
  </head>
  <body>
    <canvas id="stage" width="640" height="360"></canvas>

    <script src="glissade.browser.js"></script>
    <script>
      var G = window.glissade;
      var canvasEl = document.getElementById('stage');

      // A scene: one rectangle we'll animate.
      var scene = G.createScene({
        size: { w: 640, h: 360 },
        build: function (s) {
          return s.add(
            new G.Rect({
              id: 'box',
              x: 100,
              y: 150,
              width: 80,
              height: 80,
              fill: '#89b4fa',
            }),
          );
        },
      });

      // The Canvas2DBackend takes the CANVAS ELEMENT (not a 2d context).
      var backend = new G.Canvas2DBackend(canvasEl);
      scene.setTextMeasurer(backend);

      // A timeline: slide the box across, looping every 2s. Animation is data —
      // the fluent builder compiles to a serializable document; nothing runs at
      // play time.
      var timeline = G.timeline(function (tl) {
        tl.to('box/x', 100, 460, { duration: 2, easing: 'easeInOutCubic' });
      });

      // Lean own-rAF loop: evaluate (pure function of time) → render.
      var DURATION = 2;
      function frame(tMs) {
        var t = (tMs / 1000) % DURATION;
        backend.render(G.evaluate(scene, timeline, t));
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    </script>
  </body>
</html>
```

> The exact `createScene` / `Rect` / `timeline` shapes above mirror the scoped-package API — see [Getting started](/getting-started) and [Concepts](/concepts) for the authoritative signatures; the bundle exposes the identical names on `window.glissade`.

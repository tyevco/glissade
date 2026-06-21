# @glissade/browser

A single-file IIFE bundle of glissade's realtime browser embed path — core, scene, Canvas2D backend, player, and the `<gs-player>` element — for `<script src>` / no-build use. Everything lands on `window.glissade.*`, and loading the script auto-registers `<gs-player>`.

```html
<script src="glissade.browser.js"></script>
<script>
  const G = window.glissade;
  const scene = G.createScene({ size: { w: 640, h: 360 } });
  const backend = new G.Canvas2DBackend(document.querySelector('canvas'));
  scene.setTextMeasurer(backend);
  // ...own rAF loop: backend.render(G.evaluate(scene, timeline, t))
</script>
```

What's included: the realtime embed surface only — core (`evaluate`, signals, timeline builder, easings, springs, seeded RNG), scene (node tree + `DisplayList`), the Canvas2D backend, the player (`mount`, drivers), and `<gs-player>`. Not included: the CLI, the Skia backend, the video export path, studio, and `effects-webgpu` — those are export/desktop-only and don't affect realtime authoring.

See the [browser guide](https://tyevco.github.io/glissade/browser) for the full standalone walkthrough, including the FOUT caveat for own-rAF consumers.

Apache-2.0.

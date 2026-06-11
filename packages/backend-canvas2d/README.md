# @glissade/backend-canvas2d

The browser rasterizer: consumes a DisplayList and draws it to a `<canvas>` / `OffscreenCanvas` 2D context — transforms, paths, text, group compositing. Per-path deterministic twin of `@glissade/backend-skia`; the two are held together by an SSIM parity suite in CI.

```sh
npm i @glissade/backend-canvas2d
```

```ts
import { Canvas2DBackend } from '@glissade/backend-canvas2d';
import { evaluate } from '@glissade/scene';

const backend = new Canvas2DBackend(canvas);
backend.render(evaluate(scene, doc, t));
```

Most apps don't use this directly — `mount()` from `@glissade/player` wires it up.

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

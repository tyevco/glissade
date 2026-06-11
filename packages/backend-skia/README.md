# @glissade/backend-skia

The headless rasterizer: DisplayList → Skia via `@napi-rs/canvas` (prebuilt N-API, no browser anywhere). This is what makes glissade's determinism claims testable — golden frames render **byte-identically** across machines on the pinned toolchain, and CI byte-compares committed PNGs on every push.

```sh
npm i @glissade/backend-skia
```

```ts
import { SkiaBackend } from '@glissade/backend-skia';

const backend = new SkiaBackend(640, 360);
backend.render(evaluate(scene, doc, t));
writeFileSync('frame.png', backend.encodePng());
```

Node-only. The `gs` CLI (`@glissade/cli`) drives it for full renders.

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

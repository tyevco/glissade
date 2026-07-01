# @glissade/scene

The scene graph and the **DisplayList IR**: nodes (Group, Rect, Circle, Path, Text, Image, Video) whose every animatable property is a signal, `createScene`, and the canonical `evaluate(scene, timeline, t) → DisplayList`. Text layout (explicit fonts, Intl.Segmenter line breaking) is deterministic across browser and headless render. Yoga flexbox lives behind the LayoutEngine seam at the separate `@glissade/scene/layout` entry — the base path never pays for wasm — including `width/height: 'auto'` content sizing and `computedSize()`. Other tree-shaken subpaths carry `splitText` (`./type`), `Grid` (`./grid`), motion-path drivers (`./motion`), the SVG `d` parser (`./path`), and `Chart()` + serializable scales (`./chart`).

```sh
npm i @glissade/scene @glissade/core
```

```ts
import { createScene, Circle, evaluate } from '@glissade/scene';

const scene = createScene({
  size: { w: 640, h: 360 },
  children: [new Circle({ id: 'dot', radius: 40, fill: '#e6a700', position: [320, 180] })],
});
const displayList = evaluate(scene, doc, 1.25); // pure, serializable, renderer-agnostic
```

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

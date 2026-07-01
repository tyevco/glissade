# @glissade/player

The embed runtime: `Player` (play/pause/seek/loop/rate — time-based, never frame-counted), the **Driver** seam (`InputDriver<T>`: clock, scroll, or anything that writes a value), and `mount()` — scene + timeline + canvas in one call. v2 machines attach here: `player.attach(machine)` steps them on every host tick, even while linear playback is paused, with hard target-disjointness validation.

```sh
npm i @glissade/player
```

```ts
import { mount } from '@glissade/player';

const { player } = mount(scene, doc, canvas, { loop: true, autoplay: true });
player.seek(1.5); // pure: identical to having played there
```

### Custom render backend

`mount()` rasterizes through `Canvas2DBackend` by default. To drive a different
`RenderBackend` (e.g. the `@glissade/backend-dom` preview renderer, shipped in
0.21), pass a factory as `opts.backend` — it receives the mount target and
returns the backend:

```ts
mount(scene, doc, canvas, { backend: (target) => new MyBackend(target) });
```

Omit it and the default `Canvas2DBackend` is used, so every existing call site is
unchanged. This is the single injection seam: `@glissade/player` never statically
imports a non-default backend — the caller above it supplies the alternative.

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

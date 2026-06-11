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

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

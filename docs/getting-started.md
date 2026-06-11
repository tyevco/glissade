# Getting started

glissade is a TypeScript framework for programmatic motion graphics: animations are **data**, evaluation is a **pure function of time**, and the same scene runs real-time in a page, renders frame-exact in CI, and opens in a visual studio.

> Status: 0.x — APIs settling, published to npm with provenance. `npm i @glissade/core @glissade/scene @glissade/player` (and `@glissade/interact` for state machines, `-D @glissade/cli` for headless rendering).

## A scene in sixty seconds

A scene module pairs a scene factory with a timeline document:

```ts
// my-scene.ts
import { timeline, spring } from '@glissade/core';
import { createScene, Circle, Rect, type SceneModule } from '@glissade/scene';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Circle({ id: 'dot', radius: 40, fill: '#e6a700', position: [120, 180], opacity: 0 }),
      ],
    }),
  timeline: timeline((tl) => {
    tl.to('dot/opacity', 1, { duration: 0.5 })
      .to('dot/position.x', 520, { ease: spring({ stiffness: 170, damping: 14 }) })
      .label('arrived')
      .to('dot/fill', '#7c4dff', { duration: 0.6, at: 'arrived' });
  }),
};

export default mod;
```

Things to notice:

- **No generators, no awaited tweens.** The builder chain *compiles* to a serializable keyframe document; nothing executes at play time, so seeking to any `t` is a lookup, never a replay.
- **Position grammar**: `at: '<'` (align with previous start), `'>'`, `'+=0.5'`, labels — the GSAP vocabulary, but from-values resolve against the document, never the live scene.
- **Springs are closed-form.** `spring(cfg)` knows its own duration (`spring.duration(cfg)`), so "after the spring settles" just works.

## Play it in a page

```ts
import { mount } from '@glissade/player';
import mod from './my-scene.js';

const { player } = mount(mod.createScene(), mod.timeline, canvas, { loop: true });
player.play();
player.seek(1.25); // O(log keys) — scrub anywhere, any direction
```

## Render it headless

```sh
gs render my-scene.ts --out out.mp4        # PNG frames → ffmpeg mux, no browser
gs render my-scene.ts --out frames/        # PNG sequence
```

Same scene, same pixels, byte-identical across processes and machines on a pinned toolchain — that's what the golden-frame CI suite asserts.

## Export from the browser

```ts
import { exportVideo } from '@glissade/export-web';
const { blob } = await exportVideo(scene, mod.timeline); // WebCodecs, faster than realtime
```

Codec support is feature-detected (mp4 → webm fallback); `exportPngFrames` is the unconditional fallback.

## Stateful animation: bake it

Physics can't be a pure function of time — so it runs **once**, at compile time:

```ts
import { bake, timeline } from '@glissade/core';

const tracks = bake({
  duration: 3, fps: 60, seed: 7,
  setup: (rng) => ({ y: 0, vy: 0 }),
  step: (w, dt) => ({ y: w.y + w.vy * dt, vy: w.vy + 980 * dt }),
  sample: (w) => ({ 'ball/position.y': w.y }),
});
// baked tracks are ordinary keyframes: scrubbable, diffable, exportable
const doc = timeline({ tracks });
```

## Open it in the studio

```sh
pnpm --filter @glissade/studio dev
```

Scrub, inspect live signal values, and drag keyframes — GUI edits persist to a `*.edits.json` sidecar next to your scene module and survive code edits: code owns structure, the editor owns the keys you touch.

## Next

- [Core concepts](concepts.md) — signals, tracks, the evaluate contract
- [Migrating from Motion Canvas](migrating-from-motion-canvas.md)
- [Architecture & design](DESIGN.md) — the full spec, with every decision and its rejected alternatives

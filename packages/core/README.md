# @glissade/core

The engine-agnostic heart: pull-based signals, the serializable keyframe **Timeline document**, the fluent builder that compiles to it, easing + closed-form springs, OKLab color, `bake()` for stateful simulation under seeking, and the v2 analytic layer (ease derivatives, `velocityAt`, `spring.retarget`). Zero DOM or Node dependencies; ≤ 17 kB gz (the CI-enforced budget).

```sh
npm i @glissade/core
```

```ts
import { timeline, spring } from '@glissade/core';

const doc = timeline((tl) => {
  tl.to('dot/opacity', 1, { duration: 0.5, from: 0 })
    .to('dot/position.x', 520, { from: 120, ease: spring({ stiffness: 170, damping: 14 }) })
    .label('arrived')
    .to('dot/fill', '#7c4dff', { duration: 0.6, at: 'arrived', from: '#e6a700' });
});
// `doc` is plain JSON: nothing executes at play time, so any t samples in O(log keys)
```

One contract underneath everything: evaluation is a **pure function of time** — same inputs, same output, in any order.

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

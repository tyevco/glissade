# Motion craft

A family of build-and-render helpers that shape *motion* rather than geometry —
retiming and trails (`retime` / `Echo`), rotation drivers (`orientToPath` /
`lookAt`), and real sampled `motionBlur`. All are pure, so they stay in the golden
corpus and scrub backward for free.

## `retime` — speed ramps, reverse & ping-pong

`retime(tracks, spec)` remaps a set of tracks' key **times** and hands back ordinary retimed `Track[]`. Nothing new runs at play time — it's a build-time transform, the sibling of `stagger`, so `evaluate()` stays a pure function of time.

```ts
import { retime, track, key } from '@glissade/core';

const move = [track('box/position.x', 'number', [key(0, 0), key(1, 100, 'easeInCubic')])];

retime(move, { speed: 0.5 });    // half speed (slow-mo) — key times ×2
retime(move, { speed: 2 });      // twice as fast — key times ÷2
retime(move, { shift: 1.5 });    // delay the whole group by 1.5s
retime(move, { reverse: true }); // play it backward, in place
retime(move, { pingpong: true }); // forward then back, as one track
```

| Option | Effect |
| --- | --- |
| `speed` | Playback rate; `2` = twice as fast, `0.5` = slow-mo. Must be `> 0`. |
| `shift` | Seconds added to every key (delay/advance), applied after speed. |
| `reverse` | Backward in place — same span, values reversed, **eases time-mirrored exactly**. |
| `pingpong` | Forward then a mirrored return leg, merged into one track. |

**Reverse is exact.** The built-in eases pair up (`easeInX ↔ easeOutX`, `easeInOutX`/`linear` self-mirror) and a `cubicBezier` mirrors by point reflection, so a reversed segment eases identically played backward. Where a clean mirror doesn't exist — a **spring** ease (causal) or a **hold** segment (asymmetric in time), or a non-positive `speed`, or `reverse` and `pingpong` together — `retime` **throws** with an actionable message rather than mis-animating. Retime those with `{ speed }` / `{ shift }`, or author the reverse explicitly.

`retime` returns new tracks; the inputs are untouched.

## `Echo` — motion trails & onion-skin

`echo(child, opts)` (and the `Echo` node) render their subtree at the playhead **plus K−1 earlier offsets** — `t`, `t − spacing`, `t − 2·spacing`, … — each trailing copy fading by `decay`. The leading copy is the live frame; the ghosts are the subtree *as it was* a few slices ago.

```ts
import { echo, createScene } from '@glissade/scene';
import { followPath } from '@glissade/scene/motion';

createScene({
  size: { w: 640, h: 360 },
  children: [
    echo(mover, { count: 6, spacing: 0.05, decay: 0.7 }), // mover leaves a fading trail
    followPath(mover, route, { id: 'orbit' }),            // …however its motion is driven
  ],
});
```

| Option | Default | Meaning |
| --- | --- | --- |
| `count` | `5` | Total copies including the live one. |
| `spacing` | `0.08` | Seconds between successive copies (the trail's time spread). |
| `decay` | `0.6` | Opacity multiplier per trailing step — copy *i* has opacity `decay^i`. |

Because the ghosts come from re-reading the *same* subtree at earlier times, they follow **whatever drives it** — keyframe tracks, `followPath`, computed signals — all re-derive at the offset time. It's the pure render form of "re-evaluate at t + k·spacing": within one frame `Echo` re-addresses the scene playhead to each offset, emits the children, then restores it — so `evaluate()` stays a pure function of the *current* time, the trail is byte-stable in the golden corpus, and scrubbing backward reproduces exactly.

> Use it for comet trails, strobe echoes, and (with a large `spacing`) editor-style onion-skinning — a few frames of context ahead of and behind the current pose.

## `orientToPath` / `lookAt` — rotation drivers

Two companion **driver** nodes that own only their target's `rotation` via
pull-based binding — the rotation-only siblings of [`followPath`](/motion-path)'s
`orient`. Position stays whatever else drives it (keyframes, layout, a separate
`followPath`); the driver just re-derives an angle each read, so `evaluate()` stays
pure. Add the driver to the scene — it draws nothing. Both ship on the
tree-shakeable **`@glissade/scene/motion`** subpath (like `followPath`).

```ts
import { orientToPath, lookAt } from '@glissade/scene/motion';

// bank `rocket` to the route's tangent while its POSITION comes from elsewhere
children: [rocket, orientToPath(rocket, route, { id: 'bank', progress: 0.5 })];

// `turret` always faces `mover` as it moves
children: [turret, mover, lookAt(turret, mover)];
```

**`orientToPath(target, path, props?)`** owns `target.rotation`, binding it to the
path **tangent** at `progress` — the node banks to face its direction of travel.
`path` is a static `PathValue` or a `Path` node followed **live** (re-sampled as
its `data` morphs).

| Option | Default | Meaning |
| --- | --- | --- |
| `progress` | `1` | 0→1 arc-length position whose tangent sets the angle. Track `<id>/progress`. |
| `offset` | `0` | Degrees added to the tangent angle (e.g. if the sprite points up at rest). |
| `samplesPerSegment` | — | Arc-length sampling resolution (as `followPath`). |

Pair it with a `followPath` sharing the same `progress` track to drive position
and rotation from one signal (the position from `followPath`, the banking from
`orientToPath`) — they compose independently.

**`lookAt(target, at, props?)`** owns `target.rotation`, aiming `target`'s local
`+x` axis at the `at` node's world origin — a turret tracking a mover, an arrow
pointing at a label. `offset` (degrees) adjusts the rest orientation (pass `-90` if
the sprite points up at rest). The angle is computed in world space and applied as
`target`'s local rotation, which is exact when `target`'s parent is unrotated (the
common case).

The [`golden-orient`](https://github.com/tyevco/glissade/blob/main/packages/examples/src/scenes/golden-orient.ts)
scene laps a rocket around an elliptical track — its **position** owned by
`followPath`, its **rotation** by a separate `orientToPath` — while a center turret
uses `lookAt` to pivot and always face the rocket:

```ts
import { followPath, orientToPath, lookAt } from '@glissade/scene/motion';

createScene({
  children: [
    /* bg, track, hub, */ turret, rocket,
    followPath(rocket, loop, { id: 'ride' }),   // POSITION along the loop (no orient)
    orientToPath(rocket, loop, { id: 'bank' }), // ROTATION from the tangent, same shape
    lookAt(turret, rocket),                     // turret faces the rocket as it orbits
  ],
});
// timeline: track('ride/progress', …), track('bank/progress', …) — the same 0→1 sweep
```

## `motionBlur` — real sampled motion blur

`motionBlur(child, props?)` renders its subtree at **N sub-frame times** across a
shutter interval centered on the current frame and **averages** them, so a
fast-moving element smears exactly the way an analog shutter captures it. Because
it re-samples the whole subtree, it tracks **every** animated prop — position,
rotation, scale, path progress, colour — not a faked directional blur.

```ts
import { motionBlur } from '@glissade/scene';

// fastDot smears with real sub-frame motion blur; its background stays crisp
children: [motionBlur(fastDot, { shutter: 0.05 })];
```

| Option | Default | Meaning |
| --- | --- | --- |
| `shutter` | `0.04` | The shutter interval in **seconds**, centered on the frame time (`0` = no blur). |
| `samples` | `8` | Number of sub-frame samples averaged across the shutter (≥ 1). |

Unlike `retime`/`Echo`/the rotation drivers, `motionBlur` ships on the **base
`@glissade/scene`** index (alongside `Echo`). Like `Echo`, it re-addresses the
scene playhead within one frame (wrapped in `batch()`, restored after) to sample
sub-frame times; the averaging is a running mean done with plain compositing (paint
the k-th of N samples at opacity `1/(k+1)` over source-over — the exact equal-weight
mean), so there's **no backend change**. A degenerate `samples: 1` or `shutter: 0`
is just a plain group.

The [`golden-motionblur`](https://github.com/tyevco/glissade/blob/main/packages/examples/src/scenes/golden-motionblur.ts)
scene streaks a fast dot across the frame wrapped in `motionBlur` while a crisp
reference dot above stays sharp:

```ts
import { motionBlur } from '@glissade/scene';

children: [
  /* bg, rail, */ crisp,                              // crisp reference (no blur)
  motionBlur(fast, { id: 'mb', shutter: 0.09, samples: 16 }), // the SAME motion, smeared
];
```

## Determinism & interchange

`retime` is a build-time track transform and `Echo` / `motionBlur` re-address the
playhead purely within a frame (no `Date.now`, no `Math.random`, no cross-frame
state); the rotation drivers re-derive their angle from signals already in the
graph. So every helper here samples identically at any `t` and byte-compares on
Skia in CI — `motionBlur`'s browser↔Skia parity is perceptual-tier for the blur, as
marked in `describe()`.

One caveat for **`gs export` to Lottie**: `Echo` and `motionBlur` are realized at
emit (a multi-time re-eval), not as Timeline tracks, so they are render-only
effects — the exporter **warns** and does not bake them into keyframes (never a
silent drop; shipped 0.58.1). `orientToPath` / `lookAt` write an ordinary
`rotation` signal, so their result exports like any rotation track.

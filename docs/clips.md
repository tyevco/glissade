# Motion clips

A **clip** is a reusable, target-agnostic motion — an *entrance*, a *pulse*, an *ambient drift* — captured once as a relative-time key schedule, then *applied* to a node (or several) at a wall-clock start time. Clips are **build-time authoring sugar**, exactly like `springTo` or `stagger`: `clip.apply(...)` compiles to ordinary keyed `Track[]`, byte-for-byte identical to what you'd write by hand with `track()`/`key()`. Nothing about clips exists at play time, and clips never appear in the serialized Timeline document.

Clips live on a tree-shakeable sub-path so the keyframe literals stay off the base embed budget:

```ts
import { clip, clipList, popIn, slideIn } from '@glissade/core/clips';
import { key } from '@glissade/core';
```

## Authoring a clip

A clip is a bag of named **channels**. Each channel is a relative-time key schedule (`t` runs from 0) plus the default property-path suffix it binds to:

```ts
const fadeUp = clip({
  channels: {
    fade:  { path: 'opacity',  keys: [key(0, 0),        key(0.3, 1, 'easeOutCubic')] },
    rise:  { path: 'position', keys: [key(0, [0, 20]),  key(0.3, [0, 0], 'easeOutCubic')] },
  },
});
```

The channel's value type is inferred from `keys[0].value` (here `number` and `vec2`); pass `type` explicitly to override.

## Applying it

`clip.apply(target, startSec, opts?)` returns `{ tracks, end }`. The simplest `target` is a **node-id string** — every channel resolves to `'<nodeId>/<channel.path>'`:

```ts
const { tracks, end } = fadeUp.apply('card', 1.0);
// → 'card/opacity' and 'card/position' tracks, schedule offset to t ∈ [1.0, 1.3]
// end === 1.3  (the longest channel's last key, in wall-clock seconds)
```

These tracks are deep-equal to the hand-authored form — drop them straight into a timeline alongside builder/`track()` output and they coalesce by the normal §2.2 rules:

```ts
const tl = timeline({ tracks: [...fadeUp.apply('card', 1.0).tracks] });
```

### Per-channel targets

Pass a `{ channel: target }` map to point individual channels at *different* nodes or props — e.g. routing a `glow` channel onto a separate halo node. (The string form is just the special case where every channel shares one node id.)

```ts
fadeUp.apply({ fade: 'card-halo/opacity', rise: 'card/position' }, 0);
```

Targets resolve through the same rules as builder tweens: structural / anonymous node ids (`~Type.ordinal`) are rejected — give the node an explicit id.

### Overrides — value and ease, not topology

`opts.overrides` substitutes a channel's endpoints and arriving ease **without changing its key count**. `from` patches the first key's value, `to` the last key's value, `ease` the last segment's ease:

```ts
fadeUp.apply('card', 0, {
  overrides: { fade: { from: 0.2, to: 0.9, ease: 'easeInQuad' } },
});
```

(Adding or removing keys is out of scope — author a different clip for a different shape.)

### Speed

`opts.speed` divides every relative `t` (so `speed: 2` is half-time) and scales `end` to match:

```ts
fadeUp.apply('card', 0, { speed: 2 }); // 0.3s clip plays in 0.15s
```

## Lists and stagger

`clipList(clip, targets, startSec, { stagger })` fans a clip across many targets, offsetting child *i* by a `stagger`-style delay (a per-index gap in seconds, or a function of the index — the same shape as `stagger()`). `end` is the latest child's end:

```ts
const { tracks, end } = clipList(popIn(), items.map((it) => it.id), 0, { stagger: 0.08 });
```

`overrides` and `speed` pass straight through to each child's `apply`.

## The stdlib

A handful of ready-made clips ship from the same sub-path:

| Clip | Motion |
| --- | --- |
| `popIn(opts?)` | opacity 0→1 + scale 0.8→1 (a "pop" entrance) |
| `slideIn(edge, opts?)` | fade in while a `position` offset slides in from `'left' \| 'right' \| 'top' \| 'bottom'` |
| `pulse(opts?)` | a single scale up-and-back emphasis |
| `driftLoop(opts?)` | a slow position drift out and back |

```ts
slideIn('left').apply('panel', 0.5);
clipList(pulse(), ['a', 'b', 'c'], 0, { stagger: 0.2 });
```

`pulse` and `driftLoop` are **loop clips**: their first and last key values match, so repeating or tiling them under `clipList` reads as a continuous loop with no seam.

## Why a clip is *only* sugar

Every channel compiles through `track(target, type, keys)`, which runs the same `validateTrack` your hand-authored tracks do — strictly-increasing key times, hold-canonicalization for discrete types, the canonical `'<nodeId>/<prop.path>'` target shape. A clip can't smuggle in anything a literal track couldn't express, the `evaluate(scene, timeline, t)` purity contract is untouched, and a clip-authored fixture is indistinguishable from the literal one. See [DESIGN §2.6](/DESIGN#_2-6-two-authoring-surfaces-one-document) for where clips sit among the authoring surfaces.

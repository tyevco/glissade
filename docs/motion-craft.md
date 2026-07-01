# Retiming & motion trails

Two build-and-render helpers that shape *time* rather than geometry — both pure, so they stay in the golden corpus and scrub backward for free.

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

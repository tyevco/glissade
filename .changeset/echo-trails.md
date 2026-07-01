---
"@glissade/scene": minor
---

Motion-craft quick-win: `Echo` / `echo()` — motion trails & onion-skin

A wrapper node that renders its subtree at the playhead **plus K−1 earlier offsets** (`t − i·spacing`), each trailing copy fading by `decay` — comet trails, strobe echoes, editor onion-skinning. The leading copy is the live frame; the ghosts are the subtree "as it was" a few slices ago (their positions come from whatever drives them — tracks, `followPath`, computed signals all re-derive at the offset time).

It is the pure render form of "re-evaluate at t + k·spacing": within one frame Echo re-addresses the scene playhead to each offset, emits the children, then **restores** it before the walk continues — the whole dance wrapped in `batch()` so a player's repaint subscriber coalesces to a single idempotent notification at the restored time (never mid-emit reentrancy). Headless the playhead has no subscribers, so it's a plain pure multi-sample: `evaluate()` stays a pure function of time, the DisplayList is byte-stable, and the cache-cold determinism audit passes.

```js
import { echo } from '@glissade/scene';
echo(mover, { count: 6, spacing: 0.05, decay: 0.7 }); // mover leaves a fading trail
```

`EvalContext` gains an optional `playhead` (the one channel a node may re-address within a frame); it's supplied by the real `evaluate()` / `emitWithIds()` / cache-audit, so existing nodes are unaffected. Ships on the base scene index alongside `ShaderEffect`; a golden + showcase scene added.

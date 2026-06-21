# Composing timelines

A `Timeline` document is the serializable source of truth: tracks, labels, markers, audio, and **nested children**. The fluent builder (`timeline(tl => …)`) compiles to that document — nothing executes at play time. Children let you author a piece of motion once as a **0-relative sub-timeline**, then place it on a parent's time axis. `add` is the primitive; `sequence` and `at` are pure build-time sugar over it.

A "sub" is just a built `Timeline` — the output of `timeline(tl => …)`. Author it from time 0; the parent decides where it lands.

```ts
const intro = timeline((tl) => {
  tl.to('title/opacity', 1, { duration: 0.5 }).to('title/position.y', 0, { duration: 0.5 });
});
const outro = timeline((tl) => {
  tl.to('title/opacity', 0, { duration: 0.4 });
});
```

## `add(sub, at?)` — the primitive

`add` rebases a 0-relative sub to the resolved cursor and advances the chain end by the sub's compiled duration. With no position it starts at the running chain end (`prevEnd`); otherwise it accepts the full position grammar (`1.5`, `'+=0.5'`, `'<'`/`'>'`, `'label'`).

```ts
timeline((tl) => {
  tl.add(intro)          // starts at 0
    .add(outro, '+=1');  // 1 s after intro's end
});
```

A sub's `.call()` callbacks are **forwarded onto the parent** when added, so `player.onMarker(...)` still fires them; a parent's own callback wins a marker-name collision.

## `sequence(subs, { gap })` — chain N subs end-to-end

`sequence` adds each sub at the running chain end, inserting a scalar `gap` (seconds) of slack between consecutive subs. It is exactly a hand-written `add(a); add(b, '+=gap'); add(c, '+=gap')` chain — ordinary `ChildEntry` rows, byte-identical, serializable, with zero runtime cost.

```ts
timeline((tl) => {
  tl.sequence([sceneA, sceneB, sceneC], { gap: 0.25 });
});
```

Because `add` advances the cursor by each sub's *compiled* duration, **changing one sub's internal length auto-shifts the rest** — lengthen `sceneA` and `sceneB`/`sceneC` slide later automatically, with no hand-edited offsets. `gap` defaults to `0` (back-to-back).

A negative `gap` overlaps the subs arithmetically (each starts before the previous one ends). It does **not** synthesize a crossfade — the overlapping tracks coalesce by the normal last-writer-wins rule; authoring a true crossfade is a separate, deferred design.

## `at(time, sub)` — absolute placement

`at(time, sub)` places a sub at an absolute parent time — sugar for `add(sub, time)` (a numeric position resolves to itself). The method name `at` is the builder's composition verb, distinct from the `at` *field* in `TweenOpts`/`StaggerOpts`.

```ts
timeline((tl) => {
  tl.at(3, lowerThird); // lowerThird's local t=0 lands at parent t=3
});
```

## Why this is data, not code

Every composition method emits plain `ChildEntry` rows on the parent document. There are no generators and no promise-chained sequencing: the result is the same JSON you could have written by hand, so seek behaves identically to play-through and the whole timeline stays serializable, diffable, and editable in the studio.

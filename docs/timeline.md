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

A sub's `.call()` callbacks are **forwarded onto the parent** when added, so `player.onMarker(...)` still fires them. Each added sub's `call:*` markers are namespaced by the sub's position (`c<index>/…`), so two sibling subs that each define a `.call()` never collide — both register and fire at their own rebased times. A parent's own `.call()` keeps its un-prefixed name.

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

## `stagger(targets, spec, opts)` — cascade one tween across a list

`stagger` loops the shipped `to`/`fromTo` emission over `targets`, offsetting each by a per-target delay. It emits keys **byte-identical** to N hand-authored offset tweens — pure build-time sugar.

```ts
timeline((tl) => {
  tl.stagger(['a/opacity', 'b/opacity', 'c/opacity'], { from: 0, to: 1 }, { each: 0.1 });
});
```

- **`spec`** is the shared tween (`{ to, from?, duration?, ease? }`). `spec.from` is the start **value** — when present each target routes through `fromTo`.
- **`opts.anchor`** picks the placement the cascade ranks outward from — `'start'` (default), `'end'`, `'center'`, `'edges'`, or a numeric index. This is the placement **axis**, distinct from `spec.from` (the start value). Earlier releases called this `from`; it was renamed to `anchor` to remove that collision.
- **`opts.each`** is the per-target delay. A **number** gives the uniform cascade `d_i = rank_i * each`. A **function** `(rank, count) => seconds` maps each target's rank (and the group size) to its own delay — accelerating, decelerating, or eased cascades:

  ```ts
  // accelerating: each successive item starts after a growing gap
  tl.stagger(items, { to: 1 }, { each: (rank) => rank * rank * 0.05 });
  ```

  The function must return a finite number for every target.
- **`opts.at`** places the whole group's base position (defaults to the chain end). The group reads as **one block** to a following `'<'`/`'>'`/`'+='` step: its bounds are the true min/max delay (so a backward or non-uniform spread reports honestly), and a spring `spec.ease` contributes its own computed duration to the group end.

An **empty** `targets` list is a true no-op (the cursor is untouched). A non-finite `each`/`anchor`, or a delay that would place a key at `t < 0`, throws a `TimelineValidationError` at build time rather than emitting silent NaN / negative keys.

### When `stagger` fits — and when it doesn't

`stagger` fans **one shared tween** across the targets: `spec.to`/`spec.from` are single values. So it's the right tool for a **same-tween cascade** — N items animating the *identical* opacity / scale / reveal, offset in time (a list revealing, dots filling, a row checking in).

It is **not** for a **per-target-destination** cascade — e.g. cards dealt where each flies from its own start to its own grid slot. Those are genuinely N *different* position tweens; author them as an explicit loop of `to`/`fromTo` calls (optionally each offset like `stagger` does). Reaching for `stagger` there fights the shared-value model. *(A future `spec.to: (i) => value` form could close this — see the per-target-spec card — but the explicit loop is the correct shape today.)*

## Why this is data, not code

Every composition method emits plain `ChildEntry` rows on the parent document. There are no generators and no promise-chained sequencing: the result is the same JSON you could have written by hand, so seek behaves identically to play-through and the whole timeline stays serializable, diffable, and editable in the studio.

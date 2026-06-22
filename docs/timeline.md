# Composing timelines

A `Timeline` document is the serializable source of truth: tracks, labels, markers, audio, and **nested children**. The fluent builder (`timeline(tl => …)`) compiles to that document — nothing executes at play time. Children let you author a piece of motion once as a **0-relative sub-timeline**, then place it on a parent's time axis. `add` is the primitive; `sequence` and `at` are pure build-time sugar over it.

A "sub" is just a built `Timeline` — the output of `timeline(tl => …)`. Author it from time 0; the parent decides where it lands.

> **Options are strict.** `to` / `fromTo` / `set` / `stagger` validate their options object against a known-key allow-list and **throw a `TimelineValidationError`** naming any unknown key — a misspelled or wrong option (`{ esae: … }`, `{ dur: … }`) fails loudly at build time instead of being silently ignored. The known keys are: `to`/`fromTo` → `duration`, `ease`, `at`, `from`; `set` → `at`; `stagger` spec → `to`, `from`, `duration`, `ease`; `stagger` opts → `each`, `anchor`, `at`.

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

- **`spec`** is the shared tween (`{ to, from?, duration?, ease? }`). `spec.from` is the start **value** — when present each target routes through `fromTo`. Both `spec.to` and `spec.from` accept either a single value (fanned uniformly across every target) **or** a function `(index, count) => value` resolved **per target** — so a per-target-destination cascade (each card flying to its own slot) is expressible:

  ```ts
  const slot = [10, 20, 30];
  // each target lands at its OWN destination, still time-offset by `each`
  tl.stagger(['a/x', 'b/x', 'c/x'], { from: 0, to: (i) => slot[i] }, { each: 0.1 });
  ```

  The branch is a runtime `typeof` check (consistent with `each` and scene `each()`): a callable value is **called**, so if `T` itself is a function, pass it through an explicit loop instead.
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

`stagger` fans **one shared tween** across the targets — so it's the natural tool for a **same-tween cascade**: N items animating the *identical* opacity / scale / reveal, offset in time (a list revealing, dots filling, a row checking in).

A **per-target-destination** cascade — cards dealt where each flies from its own start to its own grid slot — is now expressible too: pass `spec.to`/`spec.from` as a function `(index, count) => value` (above). Each target then gets its own endpoint while still sharing the cascade's timing, duration, and ease; the emitted keys are byte-identical to the equivalent explicit loop of `fromTo` calls. (When the per-target shape needs more than its endpoint to differ — a different ease or duration per item — an explicit loop of `to`/`fromTo` remains the right tool.)

## Composing build-time tracks — `presence` / `clip` / `each` / `morph`

The clip tier on `@glissade/core/clips` (`presence`, `clip`, `clipList`, `each`, `morph`) is **not** part of the fluent builder — those are functions that **return `{ tracks, … }`**, and you compose their tracks into a **Timeline document** directly:

```ts
import { presence, clip } from '@glissade/core/clips';

const card  = presence('card',  { window: [1, 5], enter: { opacity: [0, 1], offset: 16, dur: 0.5 }, exit: {} });
const label = presence('label', { show: card.hiddenAt, hide: 6 });

const doc = {
  duration: 6,
  tracks: [...card.tracks, ...label.tracks],   // compose the returned tracks
};
```

`doc` is an ordinary serializable Timeline document — the same shape `timeline(tl => …)` compiles to — so `evaluate(scene, doc, t)` runs it.

### `tl.tracks(tracks)` — inject clip-tier tracks into the fluent chain

You don't have to drop out of the fluent builder to use the clip tier. `tl.tracks(tracks)` injects pre-built `Track[]` (the `{ tracks }` a `presence`/`clip`/`each`/`morph` returns) straight into the document, so a clip-tier cascade composes **alongside** ordinary `to`/`stagger` steps in one chain:

```ts
import { presence } from '@glissade/core/clips';

timeline((tl) => {
  tl.to('box/x', 1, { duration: 1 })
    .tracks(presence('card', { window: [1, 3], enter: { opacity: [0, 1] } }).tracks);
});
```

The injected tracks carry their **own absolute keyframe times** — `tl.tracks` lands them as ordinary track rows (the same finalize→coalesce path `add()` uses for child tracks; same-target rows coalesce, later wins) and does **not** move the cursor. It is scoped tightly to raw absolute-time tracks: there is no cursor-offset / rebasing wrapper (that's deferred), so author the clip's times where you want them on the parent axis.

> **In the no-build `@glissade/browser` IIFE:** `presence`/`clip`/`each`/`morph` are on `window.glissade`, and `tl.tracks(...)` is available on the fluent builder there too — or compose `.tracks` into a Timeline-document literal as shown above. This is the same "compose at build time" boundary as `@glissade/scene/layout` — the functions run, you assemble the document.

You can also seed the same pre-built tracks through the builder's **second argument** — `timeline(fn, { tracks })` injects them exactly where `tl.tracks(...)` does (same finalize→coalesce path, no cursor move):

```ts
timeline(
  (tl) => {
    tl.to('box/x', 1, { duration: 1 });
  },
  { tracks: presence('card', { window: [1, 3], enter: { opacity: [0, 1] } }).tracks },
);
```

`init.tracks` lands first; a `tl.tracks(...)` call inside the body coalesces later-wins over it at a shared target. (The object/document form `timeline({ tracks, fps, duration })` carries its tracks the same way.)

## Why this is data, not code

Every composition method emits plain `ChildEntry` rows (or, for the clip tier, plain `Track` rows) you compose into the document. There are no generators and no promise-chained sequencing: the result is the same JSON you could have written by hand, so seek behaves identically to play-through and the whole timeline stays serializable, diffable, and editable in the studio.

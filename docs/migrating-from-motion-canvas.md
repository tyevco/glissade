# Migrating from Motion Canvas

glissade keeps what Motion Canvas got right — signals, a scene graph, write-steps-in-order authoring, live preview — and removes the generator runtime. Below, the common idioms side by side.

The structural difference to internalize first: in Motion Canvas, your generator *is* the timeline, discovered by executing it (which is why backward scrub replays the scene). In glissade, your code *builds* a timeline document; playback and export evaluate it as a pure function of time. Same ergonomics at the keyboard, different machine underneath.

## The idioms

**Tween a property, then another** — `yield*` chains become builder chains:

```ts
// Motion Canvas
yield* circle().opacity(1, 1);
yield* circle().position.x(300, 1);

// glissade
tl.to(circle.opacity, 1, { duration: 1 })
  .to(circle.position.x, 300, { duration: 1 });
```

**Parallel (`all`)** — position parameters instead of combinators:

```ts
// Motion Canvas
yield* all(circle().position.x(300, 1), circle().scale(2, 1));

// glissade — '<' aligns with the previous tween's start
tl.to(circle.position.x, 300, { duration: 1 })
  .to(circle.scale, [2, 2], { duration: 1, at: '<' });
```

**`chain` / `sequence`** are just consecutive `.to()` calls (the default position is "after previous end"). Staggers are `at: '<+0.1'` offsets in a loop.

**`waitFor(0.5)`** → `at: '+=0.5'` on the next tween. **`waitUntil('event')`** → `.label('event')` + `at: 'event'` (labels are also draggable in the studio, persisted to the sidecar — the `.meta` file idea, generalized).

**Loops with logic** — build-time control flow is plain TypeScript:

```ts
// Motion Canvas
for (let i = 0; i < 5; i++) yield* rects[i]().opacity(1, 0.2);

// glissade
for (let i = 0; i < 5; i++) tl.to(`rect${i}/opacity`, 1, { duration: 0.2 });
```

**Springs** — closed-form, not simulated, so they're seek-safe and self-sizing:

```ts
tl.to(circle.position.x, 300, { ease: spring({ stiffness: 170, damping: 14 }) });
// duration inferred from spring.duration(cfg); '>' after it just works
```

**Signals and computed props** carry over almost verbatim:

```ts
// Motion Canvas:  createSignal(() => radius() * 2)
// glissade:       computed(() => radius() * 2), or inline on a node:
new Rect({ width: () => circle.radius() * 2, height: 4, fill: '#fff' });
```

**Per-frame procedural logic** (`yield` in a loop touching state) is the one thing with no direct translation — deliberately, because it's also what made Motion Canvas scrub by replaying. Use:

- a **computed prop** if the value derives from time or other signals;
- **`bake()`** if it genuinely accumulates state (physics, particles): run the stepper once with fixed dt and a seeded RNG, get ordinary keyframe tracks out.

## What you gain

- Backward/random scrub is O(log keys), not O(replay-from-zero).
- `gs render scene.ts --out out.mp4` — headless, no editor, no browser; audio included.
- In-browser export via WebCodecs, faster than realtime.
- Golden-frame CI: byte-exact PNGs of any frame on a pinned toolchain.
- A timeline document you can diff in review and edit in the studio without losing code edits.

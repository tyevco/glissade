# Particles & emitters

`particles(spec)` (0.57) is a small, seeded, **baked** particle emitter — ambient
motes, an impact burst, a sparkle on a beat. It is not new engine code: it is a
*compose* of two already-shipped primitives, so every particle is a real node
driven by real keyframe tracks, and `evaluate()` stays a pure function of time.

```ts
import { particles } from '@glissade/scene/motion';
import { Circle } from '@glissade/scene';

const rain = particles({
  id: 'rain',
  count: 40,                       // MAX-CONCURRENT pool, not total emitted
  box: { w: 640, h: 360 },
  rate: 30,                        // particles/sec
  origin: [0.5, 0],                // relative viewport coords — top edge
  area: { kind: 'box', w: 640, h: 0 },
  lifetime: [1.2, 1.8],
  duration: 3,
  fps: 60,
  velocity: { speed: [180, 240], angle: [80, 100] }, // downward (y-down)
  forces: { gravity: 120 },
  appearance: () => new Circle({ radius: 2, fill: '#9ec4ff' }),
});

// scene children: [rain.node]      timeline: tl.tracks(rain.tracks)
```

It lives on the tree-shakeable **`@glissade/scene/motion`** subpath (off the base
embed, alongside `followPath`/`camera`), and is a lowercase factory — no `new`.

## How it works: `each()` + `bake()`, faithful by construction

`particles()` builds `count` fixed **slot** nodes at stable ids `${id}/${i}` via
[`each()`](/concepts) (the appearance layer — a themed dot/glyph per slot, each
with its own seeded rng), then simulates the seeded physics **once** at a fixed
`dt` with [`bake()`](/concepts) and emits ordinary frame-indexed
`position` / `opacity` / (`scale` / `rotation`) tracks targeting those same slot
ids.

Every slot is a real node → real tracks → a real exportable layer. There is **no
render-only / custom-draw path**, so Lottie interchange is faithful *by
construction* — an exporter has nothing to silently drop. Because `bake` reseeds
its rng fresh each call and never touches `Date`/`Math.random`, the emitted tracks
are byte-identical run-to-run (a *different* `seed` genuinely varies the output),
and the goldens hold like any other pixel.

## `count` is max-concurrent, not total

`count` is the size of the live-particle pool, **not** the number of particles
emitted over the whole sim. Slots are a deterministic **ring buffer**: the
`emitIndex`-th emitted particle lands in slot `emitIndex % count`, reuse
overwriting the oldest. A slot is opacity-0 before its particle's emit time and
after its lifetime ends; any slot that is opacity-0 for the **entire** sim window
is **pruned** from the output. So a low-density `drift` exports a layer count
proportional to its live particles, not `count` near-empty layers.

The pool is hard-capped at **200**: a `count` over the cap **throws**
(`particles(): count N exceeds max 200` — never a silent clamp), like every other
mis-built field. This is baked-only (v1); there is no GPU or unbounded mode. The
enforced contract is the throw — every consumer (including the no-build IIFE) gets
it; the cap is also exported as the `MAX_PARTICLE_COUNT` constant on
`@glissade/scene/motion` for npm callers who want to reference the number.

## The spec

Supply `rate` (continuous emission, particles/sec) and/or `burst` (an
instantaneous count at `t=0`, or timed `{ at, n }[]` bursts) — an emitter with
neither throws.

| Field | Meaning |
| --- | --- |
| `id` | Stable prefix — slots are `${id}/${i}`, the wrapping group is `${id}`. |
| `count` | Max-concurrent pool size (ring buffer). Bounded by `MAX_PARTICLE_COUNT`. |
| `seed` | Physics rng seed; defaults to a stable `hashStr(id)`. Reseeded per call. |
| `box` | The pixel frame the **relative** `origin` resolves against (typically the scene size). |
| `rate` / `burst` | Continuous rate and/or instantaneous/timed bursts. Supply at least one. |
| `lifetime` | Per-particle life in seconds — a scalar or `[min, max]`. |
| `duration` / `fps` | Total sim seconds and the bake frame grid (match the render fps). |
| `origin` | Spawn point in **relative** viewport coords (`[0.5, 0.5]` = center), resolved against `box`. |
| `area` | Optional spread around the origin: `{ kind: 'box', w, h }` or `{ kind: 'disc', radius }` (px). |
| `velocity` | Polar initial velocity — `{ speed: [min,max], angle: [min,max] }` (px/s, degrees; `0` = +x). |
| `forces` | Constant `{ gravity, drag, wind: [ax, ay] }` folded into the integration. |
| `spin` | Optional angular-velocity range (deg/s) — emits a `rotation` channel when present. |
| `appearance` | `(i, ctx) => Node` — the per-slot node template (a themed dot, a glyph `Text`, a small `Group`). |
| `opacityOverLife` / `scaleOverLife` | Life-fraction curves `u∈[0,1] → scalar`; `scaleOverLife` emits a `scale` channel. |
| `safeBottom` | Safe-area clamp (see below). |
| `step` | Escape hatch: replace the built-in force integration with a raw per-particle step. |

`appearance` can also return `{ node, opacityOverLife?, scaleOverLife? }` to give
one slot its own life curves (overriding the spec-level defaults). It receives a
`ctx` of `{ i, n, rng, seed }` — the seeded per-slot generator lets each mote be
subtly different without breaking determinism. `particles()` returns
`{ node, tracks, end }`: draw `node`, inject `tracks` with `tl.tracks(...)`.

## `safeBottom` — keep motes out of the caption band (0.57.1)

`safeBottom` is an opt-in safe-area clamp: **no particle spawns below this
relative Y** (`safeBottom * box.h`), so ambient motes never drift into a
lower-third caption. It is a **relative** `[0, 1]` fraction — *not* a pixel Y — and
must sit at or below the spawn band's top, or there'd be no valid spawn region
(that throws, with a message telling you to raise `safeBottom` or lower the
origin / shrink the area). The framework can't know a consumer's `captionTop`, so
this is the precise clamp; the `drift` preset also ships a conservative default
band that already clears a standard lower-third by itself.

## Presets — the corporate-explainer triad

A lean sugar layer over `particles()`: each preset fills in a right-sized,
tasteful default spec and forwards `...rest` (velocity / forces / lifetime, and
the escape-hatch `appearance` / `step`), so the sugar never caps expression. The
primary control is `appearance` as a node-template.

```ts
import { drift, sparks, dispense } from '@glissade/scene/motion';

// ambient blue motes floating gently up, honoring the safe area by default
const motes = drift({ box: { w: 640, h: 360 }, duration: 3, fps: 60 });

// a radial impact burst fired at t=0 from a point (relative coords)
const pop = sparks([0.72, 0.5], { box: { w: 640, h: 360 }, duration: 3, fps: 60 });

// a directional sparkle emanating downward on a beat, using a glyph template
const drop = dispense([0.5, 0.35], {
  box: { w: 640, h: 360 }, duration: 2, fps: 60,
  at: 0.4, angle: 90, spread: 24, glyph: '✦',
});
```

- **`drift(opts)`** — continuous low-rate, low-opacity motes drifting up
  (default `count: 24`, `rate: 8`, a soft-blue dot). Its default spawn band is
  centered and clears a standard lower-third, so bare `drift()` is caption-safe;
  pass an explicit `area` / `safeBottom` to tune for a specific `captionTop`.
- **`sparks(origin, opts)`** — a subtle radial impact burst (a win-beat / stamp
  flourish): short-life dots thrown outward from `origin`, shrinking and fading
  under a touch of gravity. Fires at `at` (default `0`).
- **`dispense(origin, opts)`** — a directional `sparks`: a sparkle emanating in
  one direction (default `angle: 90` = down, `spread: 32°`) at a beat, with an
  optional themed `glyph` (`'✦'`, `'★'`, …) node-template instead of a dot.

A caller `appearance` (via `...rest`) always wins over a preset's default
template.

## Worked example: burst + ambient field

The [`golden-particles`](https://github.com/tyevco/glissade/blob/main/packages/examples/src/scenes/golden-particles.ts)
scene runs the two default-facing presets side by side — a `sparks` impact burst
and an ambient `drift` field:

```ts
import { timeline } from '@glissade/core';
import { Rect, createScene, type SceneModule } from '@glissade/scene';
import { sparks, drift } from '@glissade/scene/motion';

const W = 640, H = 360, FPS = 60, DURATION = 3;

// Build each preset FRESH — once for createScene() (the nodes), once for the
// timeline (the tracks). particles() is deterministic (bake reseeds from the
// fixed seed each call), so both reconstruct the identical stable slot-id set +
// tracks, and the timeline binds against the same ids the scene draws.
const buildBurst = () => sparks([0.72, 0.5], {
  box: { w: W, h: H }, duration: DURATION, fps: FPS,
  count: 28, color: '#ffcf7a', radius: 3, seed: 41,
});
const buildDrift = () => drift({
  box: { w: W, h: H }, duration: DURATION, fps: FPS, id: 'motes',
  origin: [0.28, 0.72], area: { kind: 'box', w: 180, h: 120 },
  count: 20, rate: 7, color: '#9ec4ff', radius: 2.6, seed: 17,
});

const mod: SceneModule = {
  createScene: () => createScene({
    size: { w: W, h: H },
    children: [
      new Rect({ id: 'bg', width: W, height: H, position: [W / 2, H / 2], fill: '#0b0e16' }),
      buildDrift().node,
      buildBurst().node,
    ],
  }),
  timeline: timeline({
    fps: FPS, duration: DURATION,
    tracks: [...buildDrift().tracks, ...buildBurst().tracks],
  }),
};
```

The build-fresh-twice idiom mirrors `splitText`/`each`: the nodes go to
`createScene` and the tracks to the `timeline`, and because the emitter is
deterministic both halves reconstruct the same slot ids.

## Determinism & interchange

`particles()` bakes seeded physics into ordinary frame-indexed tracks — no
`Date.now`, no `Math.random`, no cross-frame state — so the same document samples
identically at any `t` on both the canvas2d and Skia backends, and the emitter is
covered by the golden-frame corpus like any other pixel. Because every slot is a
real node with real tracks and no custom draw, a `gs export` to Lottie carries the
particles faithfully, with nothing to drop.

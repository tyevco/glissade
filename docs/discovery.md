# What's on `window.glissade` beyond the basics

The [single-file browser bundle](./browser) exposes the whole realtime authoring
surface as one global — **220+ names** on `window.glissade`. Most guides
only show the headline three (`evaluate`, `createScene`, `timeline`), so the rest
is easy to miss. This page is a map of the **high-value names beyond the basics**:
one line plus a minimal, verified snippet for each. Everything here is on the IIFE
as `G.<name>` (where `const G = window.glissade`) and is identical to the scoped
`@glissade/*` package export.

> All snippets below are written against the real exported signatures. With an npm
> build, import the same names from their packages (noted per-section) instead of
> reaching for the global.

> **Working as an AI agent?** Start with [glissade for AI agents](./for-agents) —
> the cold-start guide: call `describe()` first, read the fail-loud errors, and
> verify pixels (not canvas screenshots). Then come back here for the name map.

## Transport: `createPlayer()` (play / pause / seek / rate / loop / markers / cues)

`mount(scene, timeline, canvas)` is the one-call embed (it builds the player, the
backend, the rAF render loop, and font handling for you — start there). When you
want the **transport object directly** — to wire your own play/pause UI, drive
`rate`, register marker/cue callbacks — that object is a `Player`, built by
`createPlayer(init, opts)`. `mount()` returns one as `mounted.player`:

```js
const G = window.glissade;
const mounted = G.mount(scene, timeline, document.querySelector('canvas'), { loop: true });
const player = mounted.player;

player.play();                       // → { finished: Promise<boolean> }  (true = completed, false = interrupted)
player.pause();
player.seek(0.5);                    // seek(t: seconds) — pure playhead write, never fires marker callbacks
player.rate = 2;                     // playback speed
player.play({ range: [1, 3] });      // play only a sub-range

// marker + cue callbacks (fired only when continuous playback CROSSES them)
const off = player.onMarker('chorus', (m) => console.log('hit', m.name, 'at', m.t));
player.onCue('ad-break', (m) => pauseForAd(m));   // matches a marker's data.kind
// player.playingSignal — reactive `playing` for a custom UI to subscribe to
```

To build a `Player` from scratch (no `mount`), give it a `Playhead` — a writable
time signal — and a duration: `G.createPlayer({ playhead: G.createPlayhead(), duration: 2 }, { loop: true })`.
You then render by reading the playhead (`G.evaluate(scene, timeline, player.playhead())`)
on its change. `mount()` does exactly this plumbing, so prefer it unless you need
the seams.

npm: `import { createPlayer, mount } from '@glissade/player'` and `import { createPlayhead } from '@glissade/core'`.

`<gs-player>` is auto-registered when the bundle loads. If you need to register the
element under a **custom tag name**, call `defineGsPlayer('my-player')` (idempotent;
`GsPlayerElement` is the class):

```js
G.defineGsPlayer('my-player'); // now <my-player> works too
```

npm: `import { defineGsPlayer, GsPlayerElement } from '@glissade/element'`.

## Motion along a path: `motionPath(path).atProgress(p)` / `followPath`

`motionPath(pathValue)` builds an **arc-length sampler** over a path — a pure,
deterministic table you can read points and tangents from. `atProgress(u)` returns
the point at normalized progress `u ∈ [0,1]` *by distance travelled* (constant
speed, not bezier parameter):

```js
const m = G.motionPath(G.pathFromSvg('M0 0 C 80 -120 240 120 320 0'));
m.length;            // total arc length
m.atProgress(0.5);   // [x, y] at the half-way distance
m.tangentAtProgress(0.5); // unit tangent (direction of travel)
```

To make a node *ride* the path as an animatable, add a `followPath` companion node —
it owns the target's `position` (and `rotation` with `orient`) and exposes a
`progress` you drive with a track. See the full guide: [Motion along a path](./motion-path).

```js
const cursor = new G.Rect({ id: 'cursor', width: 12, height: 12, fill: '#ff5d73' });
const route = new G.Path({ id: 'route', data: G.pathFromSvg('M0 0 C 80 -120 240 120 320 0'), stroke: '#4ea1ff' });
const scene = G.createScene({ children: [route, cursor, G.followPath(cursor, route, { id: 'cf', orient: true })] });
const timeline = G.timeline((tl) => tl.to('cf/progress', 1, { duration: 2.6, ease: G.easings.easeInOutCubic }));
```

npm: `import { motionPath, followPath, pointAtLength, pathLength } from '@glissade/scene/motion'` (the tree-shaken motion subpath, not the base index).

## Motion clips: `clip()` / `clipList()` (reusable keyframe-channel literals)

A **clip** is a reusable, target-agnostic motion — an entrance, a pulse, a drift —
captured once as a relative-time key schedule, then *applied* to a node (or several)
at a wall-clock start time. It is build-time sugar: `clip.apply()` compiles to
ordinary `Track[]`, byte-identical to hand-authored `track()`. The stdlib ships
ready-made ones (`popIn`, `slideIn`, `pulse`, `driftLoop`). Full guide:
[Motion clips](./clips).

```js
const fadeUp = G.clip({
  channels: {
    fade: { path: 'opacity',  keys: [G.key(0, 0),       G.key(0.3, 1, 'easeOutCubic')] },
    rise: { path: 'position', keys: [G.key(0, [0, 20]), G.key(0.3, [0, 0], 'easeOutCubic')] },
  },
});
const { tracks, end } = fadeUp.apply('card', 1.0); // → 'card/opacity' + 'card/position' at t∈[1.0,1.3]

// fan one clip across many targets, staggered:
const { tracks: many } = G.clipList(G.popIn(), ['a', 'b', 'c'], 0, { stagger: 0.08 });

const timeline = G.timeline({ tracks: [...tracks, ...many] });
```

npm: `import { clip, clipList, popIn, slideIn, pulse, driftLoop } from '@glissade/core/clips'`.

## Compositing: node `blend` + `filters` props (blend modes + filter effects)

Every node takes a **`blend`** prop (a blend mode: `'source-over'` default,
`'multiply'`, `'screen'`, `'overlay'`, `'darken'`, `'lighten'`) and a **`filters`**
prop — a validated, closed list of effects both backends render: `blur`,
`drop-shadow`, `brightness`, `contrast`, `saturate`. A node (or `Group`) with a
non-default blend, sub-1 opacity, or any filter composites as a unit:

```js
// additive glow via screen blend
new G.Circle({ id: 'glow', radius: 70, fill: '#7a2236', blend: 'screen' });

// a group blurred + drop-shadowed as a unit
new G.Group({
  id: 'card',
  filters: [
    { kind: 'blur', radius: 4 },
    { kind: 'drop-shadow', dx: 0, dy: 6, blur: 12, color: '#0008' },
  ],
  children: [/* … */],
});
```

Both are animatable like any prop (`blend`/`filters` are `BindableSignal`s; pass a
function for live binding). Cross-backend filter output is *perceptual* (SSIM)
parity, not byte-exact — filters are where rasterizers diverge most.

npm: `import { Circle, Group } from '@glissade/scene'` (types `BlendMode`, `FilterSpec`).

## The `paint` value type: gradients + color tweens

A node `fill`/`stroke` accepts not just a color string but a **`Paint`** — a
`linear` or `radial` gradient (or a `mesh` gradient). Geometry is in the shape's
local space; omit it to default to the filled path's bounds:

```js
new G.Circle({
  id: 'orb',
  radius: 96,
  fill: { kind: 'radial', stops: [{ offset: 0, color: '#ffe39a' }, { offset: 1, color: '#3a1d5e' }], interpolation: 'gaussian' },
});

new G.Rect({
  id: 'panel',
  width: 240,
  height: 170,
  fill: { kind: 'linear', stops: [{ offset: 0, color: '#4ea1ff' }, { offset: 1, color: '#ffb86b' }], from: [-120, -85], to: [120, 85] },
});
```

Because `paint` is a registered value type, you can **tween between paints** — a
solid color morphs smoothly into a gradient, or one gradient into another — by
keying a track of type `'paint'`:

```js
const a = { kind: 'color', color: '#ff5d73' };
const b = { kind: 'radial', stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#2a0512' }], radius: 92 };
G.track('orb/fill', 'paint', [G.key(0, a), G.key(4, b, 'easeInOutCubic'), G.key(8, a, 'easeInOutCubic')]);
```

npm: `import { type Paint } from '@glissade/core'` (gradient fills are plain JSON; no import needed to author one).

## See also

- [`renderToDataURL` / `snapshotCanvas`](./browser#snapshot-a-frame-as-a-data-url) — capture a frame as a PNG/WebP data URL.
- [In-browser webm export](./browser#exporting-video-capturing-frames) — `MediaRecorder` + `captureStream` recipe.
- `splitText` — split a `Text` node into per-word/char parts you can animate (kinetic typography). See [Typewriter & text reveal](./typewriter).

## `describe()` lists all of these

`glissade.describe()` returns a machine-readable API manifest covering **nodes**
(with their props), **value types**, **easings**, the **builder methods**, and a
**`helpers` section** that enumerates the broader helper API documented on this
page — `createPlayer`, `motionPath` / `followPath`, `clip` / `clipList`,
`renderToDataURL` / `snapshotCanvas`, `splitText`, and the rest — each with its
usage string and the import (subpath) it lives on. An AI/agent consumer can
discover everything here by introspecting `describe()` alone; see
[glissade for AI agents](./for-agents).

# Controlled / imperative drive

Sometimes the host owns the state. A physics engine, a game loop, an external
data feed, a port of an existing imperative renderer — the values come from
*somewhere else*, frame by frame, and there is no timeline to compile. glissade
supports this directly: set node properties imperatively and evaluate, with **no
timeline at all**.

```js
const scene = createScene({
  size: { w: 640, h: 360 },
  children: [new Rect({ id: 'box', position: [0, 0], width: 80, height: 80, fill: '#89b4fa' })],
});
const box = scene.nodes.get('box');

function frame() {
  // the host owns the clock AND the values
  const [x, y] = mySimulation.step(); // wherever your state comes from
  box.position.set([x, y]);

  backend.render(evaluate(scene)); // ← no timeline argument
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

`evaluate(scene)` — the no-timeline overload — is the blessed entry point for
this mode. It evaluates the scene against an **empty timeline** at the scene's
current playhead value, so whatever you set imperatively survives untouched into
the rendered `DisplayList`. `evaluate(scene, timeline, t)` (the three-argument
form) is still the canonical call for declarative, data-driven animation; this
overload is purely the "I own the values" door.

It is exactly equivalent to:

```js
evaluate(scene, timeline({ tracks: [] }), scene.playhead.peek());
```

## Why it works

glissade's properties are signals. A `Timeline` animates them by *binding* each
targeted signal's source to a sampler — `() => sampleTrack(track, playhead())` —
so at play time the value is pulled from the track, not from whatever you last
wrote. An **empty timeline binds nothing**: zero tracks ⇒ zero installed
sources ⇒ every imperative `set(...)` is the value the signal holds, and the
evaluation reads it straight through.

This is the same purity contract as everywhere else in glissade: `evaluate` is a
pure function of the scene's current state. Here that state just happens to be
state *you* wrote with `set(...)`, rather than state a timeline sampled from
keyframes.

## The precedence contract

The one rule to internalize:

> **A live timeline track always overrides `set(...)` on the property it
> targets.** Last writer wins, and binding makes the track the writer.

```js
box.position.x.set(5); // host tries to own x

// a timeline that animates box/position.x...
const tl = timeline({ tracks: [track('box/position.x', 'number', [key(0, 100), key(1, 200)])] });

evaluate(scene, tl, 0);   // → x is 100  (the track, NOT your 5)
evaluate(scene, tl, 0.5); // → x is 150
```

The track was bound to `box/position.x`, so the `set(5)` is dead for that
property while the track is live. This is **per property**: a track that targets
only `position.x` leaves `position.y`, `opacity`, `rotation`, and every other
property free for you to drive imperatively. Mix freely — let the timeline own
the animated properties and drive the rest by hand:

```js
// timeline owns opacity (a fade); the host owns position (the simulation)
const fade = timeline({ tracks: [track('box/opacity', 'number', [key(0, 0), key(1, 1)])] });
box.position.set(mySimulation.position()); // honored — opacity track doesn't touch position
backend.render(evaluate(scene, fade, t));
```

::: warning The one caveat
`set(...)` on a property that a timeline track **also targets** is overridden
while that track is live. If a property looks "stuck" at a track's value even
though you keep calling `set(...)`, a timeline track owns it. Either stop
animating that property in the timeline, or drive a different property. (Calling
`set(...)` on a bound signal *detaches* the binding immediately — so once you
stop passing the clobbering timeline to `evaluate`, your imperative value rules
again.)
:::

## A complete host loop (`dt`-based, scrub + resume)

The minimal example above advances implicitly. A real host owns a clock. The
canonical shape — a wall-clock-delta loop with scrub-overrides-play and a
persisted playhead — looks like this (distilled from a shipping 277 s, 15-scene
no-build port):

```js
let raf, last = null;
const loop = (ts) => {
  if (last == null) last = ts;
  const dt = (ts - last) / 1000;       // SECONDS since last frame — never assume 16.67ms
  last = ts;
  if (playing && hover == null) {       // advance only when playing and not scrubbing
    t += dt;
    if (t >= DURATION) t = 0;           // wrap (loop the piece)
    localStorage.setItem('mykey:t', String(t)); // resume on reload
  }
  const shown = hover != null ? hover : t; // hover (scrub) overrides play
  drive(shown);                         // set signals from `shown`, then render (below)
  raf = requestAnimationFrame(loop);
};
raf = requestAnimationFrame(loop);
```

where `drive(t)` recomputes every signal **purely from `t`** and renders:

```js
function drive(t) {
  for (const m of movements) m.run(t);  // each writes node.<prop>.set(...) from t alone
  backend.render(evaluate(scene));      // paint current signal values (no timeline)
}
```

Two properties make this sound:

- **`evaluate(scene)` paints live `.set()` values** (the "Why it works" guarantee
  above) — so the host's per-frame writes are exactly what renders.
- **`drive(t)` is a pure function of `t`** — no frame depends on the previous one
  (no integration, no easing state carried across ticks). That is what makes
  **seek ≡ play-through**: `seek(t){ t = clamp(t,0,DURATION); drive(t); }` needs no
  special path, and scrubbing to any `t` reproduces the played-through frame
  byte-for-byte.

### Keep your easing stateless (and mind springs under seek)

For controlled mode to stay seek-safe, every easing you call must be a **pure,
stateless** `f(t)` (`[0,1] → [0,1]`). glissade's named easings are; so are the
usual cubic/expo/back closed forms. **The one to watch is springs:** glissade's
springs are **closed-form / analytic** (evaluated directly from `t`, *never*
integrated step-to-step), so they are **deterministic under seek** — sampling a
spring at `t = 1.4` gives the same value whether you scrubbed there or played
through. A hand-rolled *integrated* spring solver (one that accumulates velocity
across frames) is **not** a function of `t` and **breaks** seek ≡ play-through —
don't use one in controlled mode; sample analytically instead.

## Relationship to the own-rAF embed

This is the natural companion to the [own-rAF embed path](./browser#two-ways-to-render):
there, you own the *clock* and feed it to `evaluate(scene, timeline, t)`; here,
you own the *clock and the values* and call `evaluate(scene)`. Both are pure —
same scene state in, same `DisplayList` out — so both scrub, snapshot, and
export the same way. The difference is only where the property values come from.

The `backend` in these examples is pluggable: the default `Canvas2DBackend`
rasterizes to a `<canvas>`, but the same `backend.render(evaluate(scene))` loop
drives any `RenderBackend` — e.g. `@glissade/backend-dom` for a DOM/SVG preview
(selectable text, accessibility, CSS-native embedding). `evaluate` produces the
identical `DisplayList`; only the backend that consumes it changes.

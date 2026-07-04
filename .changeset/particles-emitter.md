---
'@glissade/scene': minor
---

Particles/Emitters — `particles(spec)` + `drift`/`sparks`/`dispense` presets on `@glissade/scene/motion`.

A small, seeded, BAKED particle emitter that COMPOSES two shipped primitives — `each()` (fixed slot nodes at stable `${id}/${i}` ids) + `bake()` (seeded physics simulated once at a fixed dt → ordinary frame-indexed position/opacity/scale/rotation tracks). Every slot is a real node with real tracks, so it is a real exportable Lottie layer: **interchange is faithful by construction** — there is no render-only / custom-draw path to silently drop (the slate capstone of the interchange-verdict-per-preset discipline).

- `count` is the MAX-CONCURRENT ring-buffer slot pool (bounded at 200 — over throws, never silent-clamps), NOT total emitted; slots that are opacity-0 for the whole sim window are pruned so the exported layer count stays proportional to live particles.
- Deterministic: seed defaults to `hashStr(id)`, reseeded per call → byte-identical run-to-run; a different seed genuinely varies the output. No `Math.random`/`Date.now`.
- Presets (a lean corporate-safe triad): `drift` (ambient low-opacity motes, defaults to a small max-concurrent count), `sparks` (subtle radial impact burst), `dispense` (a directional sparks variant with an optional glyph node-template). Each forwards a `...rest`/`step`/`appearance` escape-hatch to the underlying emitter so the sugar never caps expression.
- Fail-loud on invalid count/seed/lifetime/rate/fps/duration/appearance; factory-no-`new`; `describe()`-surfaced + re-exported onto the `window.glissade` IIFE.

Off the sacred base embed (the `/motion` subpath; base unchanged at 38.85/39). Additive — existing goldens byte-identical; a new `golden-particles` showcase (sparks burst + ambient drift) byte-compared on Skia.

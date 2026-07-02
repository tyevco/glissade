---
'@glissade/core': minor
'@glissade/scene': minor
'@glissade/browser': minor
---

0.40: `Expr` — animate a prop by a FORMULA of time

`exprTrack('orb/position.y', '180 + 120*sin(t*2)')` drives a numeric prop by a
math formula of the playhead `t` instead of keyframes — orbits, pulses, jitter,
easing curves as one line. Fed via `tl.tracks([exprTrack(...)])` (the clip-tier
authoring path).

- A deterministic evaluator (tokenizer + precedence-climbing parser → closure):
  `+ - * / % ^`, unary ±, parens; constants `PI/TAU/E`; a pure-function whitelist
  (`sin cos clamp lerp smoothstep min max mod floor …`); and `rand(x)` (a seeded
  hash → [0,1) — the ONLY randomness). No `Date`/`Math.random`; an unknown
  identifier/function/arity fails loud at compile time.
- Binds through the SAME playhead channel keyframes use (`sampleTrack` at `t`), so
  it's a pure function of time — backward scrub, export sharding, and the golden
  byte-comparison all hold. A `golden-expr` showcase (Lissajous orbits) is in the
  corpus.
- The evaluator lives on the tree-shakeable **`@glissade/core/expr`** subpath, OFF
  the base embed (a metafile guard asserts it) — the base render path carries only
  a tiny compiler-register seam, so the SACRED base embed stays 39.00/39. Importing
  `@glissade/core/expr` activates it; re-exported on the browser bundle as
  `window.glissade.exprTrack`, and surfaced in `describe().helpers`.

Determinism hash + all existing goldens unchanged (Expr is additive; no
`core`/`scene` evaluate-path behaviour changed for keyed tracks).

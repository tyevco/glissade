# Formula animation (`Expr`)

`exprTrack()` (0.40) drives a numeric prop by a **formula of the playhead `t`**
instead of keyframes:

```ts
import { timeline } from '@glissade/core';
import { exprTrack } from '@glissade/core/expr';

const tl = timeline((tl) =>
  tl.tracks([
    exprTrack('orb/position.y', '180 + 120*sin(t*2)'), // orbit
    exprTrack('orb/radius', '24 + 14*sin(t*3)'), // pulse
    exprTrack('orb/opacity', '0.65 + 0.35*cos(t*2)'), // breathe
  ]),
);
```

An expr track has no keyframes — it evaluates its formula at the playhead each
frame, through the **same time channel** keyframes use. So it's a pure function of
`t`: backward scrub, export sharding, and the golden byte-comparison all work
exactly as they do for keyed tracks.

## The formula language

Arithmetic (`+ - * / %`, `^` = right-associative pow, unary ±, parens) plus a
whitelist of **pure** functions and constants:

| | |
|---|---|
| variable | `t` (the playhead, seconds) — plus any scope var a binding provides |
| constants | `PI`, `TAU`, `E` |
| 1-arg | `sin cos tan asin acos atan abs sqrt exp log floor ceil round sign fract rand` |
| 2-arg | `pow atan2 mod step` (`mod`/`%` are **floored** — `mod(-1,3) == 2`) |
| 3-arg | `clamp lerp mix smoothstep` |
| variadic | `min max` |

`rand(x)` is a deterministic seeded hash → `[0, 1)` — the **only** randomness, so
a formula stays a pure function of time. There is no `Date` or `Math.random`; an
unknown identifier or function **fails loud at compile time**, not silently.

```ts
exprTrack('dust/position.x', '320 + 200*sin(t) + 8*rand(floor(t*8))'); // jittered orbit
```

## Determinism & the budget

The evaluator (a small tokenizer + parser) lives on the tree-shakeable
`@glissade/core/expr` subpath, **off the base embed** — a scene that never uses an
expr track pays nothing for it (the base render path carries only a tiny
compiler-register seam). Importing `@glissade/core/expr` (via `exprTrack`,
`compileExpr`, or a bare side-effect import) activates it; on the browser bundle
it's `window.glissade.exprTrack`.

`compileExpr(source)` is also exported for evaluating a formula directly
(`compileExpr('sin(t)').eval({ t: 1.5 })`).

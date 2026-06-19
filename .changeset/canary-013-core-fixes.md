---
'@glissade/core': patch
---

0.13 canary fixes: five deterministic-but-wrong correctness holes in shipped sugar.

- **clipStdlib**: `popIn()` and `pulse()` authored a SCALAR `scale` channel, but the scene node `scale` prop is a `Vec2Signal` — the vec2 signal read `c[0]`/`c[1]` off a scalar → `[undefined, undefined]` → a NaN local matrix → the node + its subtree silently vanished for the whole clip window. Both now author VEC2 scale keys (`[0.8,0.8]→[1,1]` for popIn; `1→[peak,peak]→1` for pulse). Emitted tracks are byte-identical to the prior hand-authored `popInVec` workaround, so goldens are unaffected.
- **presence (degenerate window)**: a no-plateau window (`exitStart == show`) slipped through a strict `<` check; the exit's value-1 key then won the coincident-`t` dedup at `show`, destroying the enter fade AND the pre-show cull (opacity ramped 0→1 across `[0,show)`). The guard is now `<=`, so a window with no live plateau throws `PresenceError`.
- **presence (pre-show opacity leak)**: a custom `enter` whose first opacity key value ≠ 0 (e.g. `key(0,0.5)`) lerped the held-0 cull up to that value across the entire pre-show window (`sampleTrack` reads the `hold` flag off the ARRIVAL key). The pre-show segment now HOLDS 0 until the enter's first key (marked `interp:'hold'` only when its value ≠ 0), so the cull holds 0 across `[0,show)` and the ramp begins at `show`. Default-fade bytes are unchanged.
- **presence/morph (slash-bearing node ids)**: `presence`/`morph` no longer re-split a caller's node id on the FIRST `/` — they APPEND the prop suffix and trust the caller, so an `each()` clone id like `card/3` targets the CLONE, not the wrapping `card` Group. The scene's longest-registered-prefix resolver disambiguates at bind time.
- **valueTypes (mesh bg)**: a one-sided mesh `bg` in a non-hex color (hsl/named/oklch) threw from `parseColor` inside `lerp` during `evaluate()` (the 0.13 symmetric-bg path). `transparentOf` and the bg lerp now fall back to a safe snap instead of throwing.

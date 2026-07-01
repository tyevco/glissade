---
"@glissade/core": minor
---

Motion-craft quick-win: `retime(tracks, spec)` — speed ramps / reverse / pingpong as a pure key-time transform

The build-time sibling of `stagger`: remap a set of tracks' key TIMES and get ordinary retimed `Track[]` back — no runtime clock warp, no cross-frame state, so `evaluate()` stays a pure function of time and the result is golden-stable and O(log keys) scrubbable.

- `{ speed }` — slow-mo / fast (key times ÷ speed).
- `{ shift }` — delay or advance the whole group (seconds).
- `{ reverse }` — play backward in place: values reversed, span preserved, and each segment's ease **time-mirrored exactly** (built-in eases pair `easeInX ↔ easeOutX`, `cubicBezier` mirrors by point reflection).
- `{ pingpong }` — forward then back as one there-and-back track.

Fail-loud (not silent mis-animation) on the causal cases: reversing a **spring** ease or a **hold** segment throws with an actionable message, as does a non-positive `speed` or `reverse` + `pingpong` together. Returns new tracks; inputs untouched. Also on the browser IIFE as `window.glissade.retime`.

```js
import { retime } from '@glissade/core';
retime(move, { speed: 0.5 });   // half speed
retime(move, { reverse: true }); // backward
retime(move, { pingpong: true }); // there and back
```

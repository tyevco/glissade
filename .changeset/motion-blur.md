---
"@glissade/scene": minor
---

Motion-craft: `MotionBlur` / `motionBlur()` — real sampled motion blur

Wrap a moving element and it renders at N sub-frame times across a shutter interval (centered on the frame) and AVERAGES them — so it smears exactly the way an analog shutter captures it, and it tracks EVERY animated prop (position, rotation, scale, path progress, colour), not a faked directional blur.

```js
import { motionBlur } from '@glissade/scene';
motionBlur(fastDot, { shutter: 0.06, samples: 16 }); // smears; its background stays crisp
```

Like `Echo`, it re-addresses the scene playhead per sample (wrapped in `batch()`, restored after) — so `evaluate()` stays a pure function of the current time. The averaging is a **running mean** done with plain compositing (no backend change): the k-th sample is painted at opacity `1/(k+1)`, which over source-over is the exact equal-weight average of all N samples. Deterministic and **byte-exact on Skia** (a new golden + showcase scene added; all existing goldens byte-identical); browser↔Skia is perceptual-tier for blur, noted in `describe()`. `samples: 1` / `shutter: 0` is a plain group. Ships on the base scene index alongside `Echo`/`ShaderEffect` (off the closed 9-node taxonomy).

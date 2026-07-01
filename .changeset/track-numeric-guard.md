---
"@glissade/core": patch
---

`track()`: fail loud on a non-numeric keyframe value for a numeric type (kill the native-panic footgun)

Keying a numeric track to a signal *accessor* (`node.height` instead of `node.height()` — a signal accessor IS a function), or to `NaN`/`Infinity`/`undefined`, used to silently propagate `NaN` through the value-type `lerp` and detonate much later as a **native backend panic** (a Skia abort with no source location). `validateTrack` now checks every key of a `number`/`vec2`-repr track and throws a `TrackValidationError` naming the target and `t`:

```
track 'bar/height': number keyframe at t=1 must be a finite number,
  got a function (a signal accessor? call it — e.g. node.height(), not node.height)
```

Additive: every valid finite key passes unchanged, so all goldens stay byte-identical (determinism holds 0.20→0.32). Affects any track, not just Chart — surfaced by two canary seats validating 0.32's data-viz feature (cards `PH3Tq14kN_1l` / `LPddSlVYosYg`).

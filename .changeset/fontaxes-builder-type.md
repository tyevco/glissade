---
'@glissade/core': minor
'@glissade/scene': patch
---

builder: `to`/`fromTo`/`set` accept an explicit `{ type }` — the value-type inference escape hatch

`inferValueType(value)` can't name a structured value like `fontAxes`'s `{ wght: 700 }` map, so the fluent builder threw `ValueTypeInferenceError` when you animated `fontAxes` (you had to drop to `track(target, 'fontAxes', keys)`). Now pass the type explicitly:

```js
timeline((tl) => tl.to('hero/fontAxes', { wght: 900 }, { type: 'fontAxes', from: { wght: 400 } }));
```

`{ type }` overrides inference for that target's whole track (and works on `fromTo`/`set` too). Two different explicit types on one target throw (a track has one value type). `describe().builder` surfaces the new option.

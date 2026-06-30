---
'@glissade/core': minor
'@glissade/scene': minor
---

Text: animatable variable-font axes (`fontAxes`)

OpenType axes (`wght`/`opsz`/`slnt`) are now ANIMATABLE. The static `fontVariationSettings` string isn't lerp-able, so animation uses a new structured value type — `fontAxes`, a `{ wght: 700, opsz: 14 }` map — set on `Text.fontAxes` and bound as a track target `<id>/fontAxes`:

```js
new Text({ id: 'hero', text: 'Bold', fontFamily: 'Inter', fontAxes: { wght: 400 } });
timeline((tl) => tl.tracks([track('hero/fontAxes', 'fontAxes', [key(0, { wght: 400 }), key(1, { wght: 800 })])]));
```

It interpolates **per-axis**, then formats to the CSS `font-variation-settings` string at draw (so backends are unchanged). Both keyframes must declare the same axis tags (a mismatched set snaps + warns, like path/paint topology). The static `fontVariationSettings` string still works (and a non-empty `fontAxes` overrides it); default Text is byte-identical. `describe()` lists `fontAxes` as an animatable target.

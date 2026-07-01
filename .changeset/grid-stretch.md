---
'@glissade/scene': minor
---

Grid: `stretch` — size children to their cells

`Grid` was position-only. Pass `stretch: true` to also SIZE each child to its cell: the resolved column-track width becomes the child's `width`, and `cellHeight` its `height`.

```js
Grid({ columns: 3, width: 360, cellHeight: 80, stretch: true, children: [rectA, rectB, rectC] }); // each 120×80
```

A plain `signal.set`, so a later explicit bind still wins; only children exposing a settable `width`/`height` signal (Rect/Image) are sized (Circle/Text/Path keep their own size and are just positioned). Default `false` — position-only, byte-identical to before.

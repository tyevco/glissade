---
'@glissade/scene': minor
---

feat(scene): `Row` / `Column` named aliases for `Stack` on `@glissade/scene/layout`

A named pair reads better than `Stack({ direction })` for the two common cases:

```js
import { Row, Column } from '@glissade/scene/layout';

const labels  = Column({ gap: 8, children: [/* … */] }); // vertical, left-aligned
const toolbar = Row({ gap: 12, children: [/* … */] });    // horizontal
```

Trivial aliases that pin the direction — `Row(props)` is identical to
`Stack({ ...props, direction: 'row' })`, `Column(props)` to `direction: 'column'`.
`direction` is omitted from their prop type (it's already fixed). They inherit
Stack's `align:'start'` default and Layout's pure, memoized resolve. Only on the
`/layout` entry — Yoga stays off the base embed and browser IIFE (same rule as
`Stack`).

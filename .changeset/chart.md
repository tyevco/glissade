---
"@glissade/scene": minor
---

`Chart()` + scales — the data-motion stack (bind a table → an animatable bar chart)

`Chart()` binds a table to a first-class, animatable bar chart. Like `Grid()` and `splitText()`, it is a **pure build-time fan-out** — it resolves your rows against serializable scales into positioned, sized child `Rect` bars *at construction* and returns an ordinary `Group`. Nothing runs at play time, so `evaluate()` stays a pure function of time and the render is byte-deterministic (a new golden + showcase scene added; all existing goldens byte-identical).

```js
import { Chart, colorRamp } from '@glissade/scene/chart';
const chart = Chart({
  id: 'sales', width: 560, height: 240, xKey: 'month', yKey: 'value',
  data: [{ month: 'Jan', value: 120 }, { month: 'Feb', value: 180 }, { month: 'Mar', value: 90 }],
  fill: colorRamp(['#39e0ff', '#ff5ca8']),  // colour bars by value
});
// scene children: [chart.node]
tl.stagger(chart.targets('height'), { from: 0 }, { each: 0.08 }); // bars rise in
```

Each bar is anchored at its **base** (`anchor: 'bottom'`) and pinned to the axis, so animating its `height` grows the bar *upward* from the axis — a bar-chart reveal or race is just a `height` track per bar (or a `fill` track for a colour sweep). `chart.targets(prop)` yields the ready-to-bind target ids in row order (`${id}/bars/${i}/${prop}`), the same shape as `splitText().targets(...)`.

Ships with serializable **scales** on the same subpath: `linearScale` / `logScale` (value axis), `bandScale` (the categorical x axis Chart uses internally), and `colorRamp` (value → `#rrggbb`). Each is a plain `{ id, domain, range }` object and is listed in `describe()` so an AI consumer binds it correctly. Chart fails loud on empty data, a non-finite value, a missing key, or non-positive dimensions.

On the tree-shakeable `@glissade/scene/chart` subpath (the **SACRED base embed is unchanged** — a metafile guard asserts the base scene excludes chart); re-exported onto the `@glissade/browser` IIFE so `window.glissade.Chart` + the scale factories survive for no-build data-viz. This MVP is vertical bar charts; line/scatter/axis-labels/time-series are a later minor (the fan-out shape generalizes). Docs: `docs/charts.md`.

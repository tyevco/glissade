# Data-driven charts

`Chart()` binds a table to a first-class, animatable bar chart. Like [`Grid()`](/layout)
and `splitText()`, it is a **pure build-time fan-out**: it resolves your rows
against serializable scales into positioned, sized child `Rect` bars *at
construction*, and returns an ordinary `Group`. Nothing runs at play time, so
`evaluate()` stays a pure function of time and the render is byte-deterministic.

It lives on the tree-shakeable `@glissade/scene/chart` subpath (off the base
embed), and is re-exported on the browser bundle as `window.glissade.Chart`.

```ts
import { timeline, track, key } from '@glissade/core';
import { createScene } from '@glissade/scene';
import { Chart, colorRamp } from '@glissade/scene/chart';

const chart = Chart({
  id: 'sales',
  data: [
    { month: 'Jan', value: 120 },
    { month: 'Feb', value: 180 },
    { month: 'Mar', value: 90 },
  ],
  xKey: 'month',
  yKey: 'value',
  width: 560,
  height: 240,
  fill: colorRamp(['#39e0ff', '#ff5ca8']), // colour bars by value
});

const scene = createScene({ size: { w: 640, h: 360 }, children: [chart.node] });
```

## Bars grow from the axis

Each bar is a `Rect` anchored at its **base** (`anchor: 'bottom'`) and pinned to
the axis baseline, so animating its `height` grows the bar *upward* from the axis
— exactly what a bar-chart reveal or race wants. `chart.targets(prop)` hands you
the ready-to-bind target ids in row order (the same shape as
`splitText().targets(...)`):

```ts
// a staggered rise-in — each bar tweens from height 0 to its value
timeline({
  fps: 60,
  duration: 2,
  tracks: chart.bars.map((_, i) =>
    track(`sales/bars/${i}/height`, 'number', [
      key(0.08 * i, 0),
      key(0.08 * i + 0.7, chart.bars[i].height(), 'easeOutCubic'),
    ]),
  ),
});
```

Because a bar's `fill` and `height` are ordinary signals, you can drive a colour
sweep on `chart.targets('fill')` or race the whole chart to a second dataset by
tweening each `height` to a new value — see the **chart** scene in the
[showcase gallery](https://tyevco.github.io/glissade/demo/app/).

## Scales

Scales are pure, serializable maps from a numeric domain onto a pixel (or colour)
range. Pass one as `yScale`, or use the default (`linearScale([0, max], [0, height])`
— bars proportional to their value, the tallest filling the box).

| Factory | Maps | Use |
| --- | --- | --- |
| `linearScale(domain, range)` | number → number | the default value axis |
| `logScale(domain, range)` | number → number | wide dynamic range (strictly-positive domain; throws otherwise) |
| `bandScale(count, range, padding?)` | index → center (+ `bandwidth`) | the categorical x axis (Chart uses this internally) |
| `colorRamp(stops, domain?)` | number → `#rrggbb` | colour bars by value |

Each is a plain object (`{ id, domain, range }` / `{ stops }`) so an agent or tool
can round-trip it. They're listed in [`describe()`](/for-agents) so an AI consumer
binds them correctly.

```ts
import { linearScale, logScale, bandScale, colorRamp } from '@glissade/scene/chart';

linearScale([0, 200], [0, 400]).map(100); // → 200
logScale([1, 1000], [0, 300]).map(10);     // → 100 (one of three decades)
colorRamp(['#000', '#fff']).map(0.5);      // → '#808080'
```

## Spec reference

```ts
Chart({
  id: string,             // required — bars bind against `${id}/bars/${i}`
  data: Row[],            // the rows to plot
  xKey: string,           // the label column (ordering / count)
  yKey: string,           // the numeric value column
  width: number,          // total chart width (px)
  height: number,         // total chart height (px) — a full-value bar fills it
  yScale?: Scale,         // default linearScale([0, max], [0, height])
  bandPadding?: number,   // gap fraction between bars (0..1), default 0.2
  fill?: string | ColorScale, // solid colour, or a ramp over the value domain
}): { node: Group, bars: Rect[], targets(prop): string[] }
```

Chart fails loud on empty data, a non-finite value, a missing `xKey`/`yKey`, or a
non-positive `width`/`height` — the same construction-time discipline as the rest
of the scene layer.

## What's in this release (0.32)

Vertical **bar charts** with `linear`/`log`/`band` scales and colour ramps.
Line charts, scatter plots, axis labels/gridlines, and time-series scales are on
the roadmap for a later minor — the build-time fan-out shape generalizes to each.

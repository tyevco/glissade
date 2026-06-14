# Motion along a path

A `Path` node draws and morphs geometry; **`followPath`** is the companion that makes another node *travel* that geometry — a cursor gliding a route, a dot running a chart line, an arrow tracing a diagram.

```ts
import { Path, Rect, followPath } from '@glissade/scene';
import { key, track } from '@glissade/core';

const route = new Path({ id: 'route', data: routeContours, stroke: '#4ea1ff', strokeWidth: 3 });
const cursor = new Rect({ id: 'cursor', width: 12, height: 12, fill: '#ff5d73' });

createScene({
  children: [route, cursor, followPath(cursor, route, { id: 'cf', orient: true })],
});

// progress 0 → 1 drives the cursor along the path's arc length
track('cf/progress', 'number', [key(0, 0), key(2.6, 1, 'easeInOutCubic')]);
```

`followPath` is a tiny companion node (it draws nothing). It **owns the target's `position`** — and its `rotation` too when `orient: true` — binding them, pull-based, to its own animatable `progress`. Add it to the scene so `track('<id>/progress', …)` can drive it.

## Constant speed (arc length)

`progress` is **arc-length parameterized**: 0.5 is the half-way point *by distance travelled*, not by bezier parameter. So the cursor moves evenly instead of slowing through gentle curves and rushing the sharp ones — which is almost always what you want for a cursor or a tracing dot.

## Orientation

`orient: true` rotates the target to the path **tangent**, so an arrow points where it's heading. Rotation is in **degrees** (a tangent of `[1,0]` is `0°`). If your sprite points up at rest rather than right, correct it with `orientOffset` (degrees):

```ts
followPath(arrow, route, { id: 'cf', orient: true, orientOffset: -90 }); // sprite drawn pointing up
```

## Sampling directly

For custom wiring, the pure sampler is exported — bind anything you like, or read points without a node:

```ts
import { motionPath, pointAtLength, pathLength } from '@glissade/scene';

const m = motionPath(routeContours);          // { length, at(s), tangentAt(s), atProgress(u), tangentAtProgress(u) }
const half = m.atProgress(0.5);               // point at the half-way distance
const tip = pointAtLength(routeContours, 40); // 40px along the path
const total = pathLength(routeContours);
```

`{ samplesPerSegment }` (default 32) trades smoothness for table size. Everything here is pure and deterministic — `atProgress` is a pure function of progress, so `evaluate()` stays pure and the motion is in the golden corpus.

## Following a morphing path

Pass `followPath` the **Path node** (not a snapshot of its data) to follow it *live* — as the route itself morphs along a `'<id>/d'` track, the cursor re-samples the current geometry and rides the bending line:

```ts
const route = new Path({ id: 'route', data: flatLine, stroke: '#ffb454', strokeWidth: 3 });
const cursor = new Path({ id: 'cursor', data: arrow });
createScene({ children: [route, cursor, followPath(cursor, route, { id: 'cf', orient: true })] });

track('route/d', 'path', [key(0, flatLine), key(2.2, arch, 'easeInOutCubic')]); // bend it
track('cf/progress', 'number', [key(0, 0), key(2.6, 1)]);                        // sweep it
```

The arc-length table is rebuilt only when the path's value actually changes (memoized by reference), so a **static** route — a raw `PathValue`, or a Path node whose data never animates — still builds its table just once. Pass a `PathValue` directly when you want a fixed route.

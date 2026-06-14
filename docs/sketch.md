# Hand-drawn sketch styles

Give any shape a hand-drawn look — marker, crayon, pencil, ink, chalk — by **roughening its geometry**, not by stamping a texture. The outline is flattened to polylines and each segment is redrawn as a slightly jittered, bowed stroke, overlaid in a few passes. Because it's pure path math seeded by a stable per-shape seed, it's byte-identical on both backends and golden-covered.

```ts
import { Rect, Circle } from '@glissade/scene';

new Rect({ id: 'card', width: 180, height: 110, stroke: '#4ea1ff', sketch: { kind: 'marker' } });
new Circle({ id: 'badge', radius: 70, stroke: '#3ddc97', sketch: { kind: 'crayon' } });
new Rect({ id: 'panel', width: 240, height: 96, fill: '#2b2417', stroke: '#ffd83d', sketch: { kind: 'pencil' } });
```

A sketched shape draws its solid `fill` (if any) underneath the roughened strokes, which take the shape's `stroke` colour (falling back to `fill`, then black). Works on `Rect`, `Circle`, and `Path` alike — the `Circle`/rounded-rect arc segments are flattened correctly.

> Not to be confused with `highlight()`'s **marker highlight** (a sweeping text highlighter). This is the marker *stroke style*.

## The styles

| `kind` | Look | Knobs (all optional) |
| --- | --- | --- |
| `marker` | bold, 2 wide passes | `width`, `roughness` |
| `crayon` | built-up, gappy, 3 passes | `width`, `roughness`, `passes` |
| `pencil` | thin, light, 2 passes | `width`, `roughness`, `passes` |
| `ink` | clean single rough line | `width`, `roughness` |
| `chalk` | dashed, rough | `width`, `roughness`, `dash` |

`roughness` is the jitter amplitude in px (0 = a clean line); `width` is the pen width; `passes` is how many overlaid strokes build the look. Each kind ships sensible defaults — `{ kind: 'marker' }` is enough.

## Determinism & seeding

The roughening is seeded by `sketchSeed` (default: a stable hash of the node `id`), and the generator is consumed fresh on every draw — so the wobble is identical every frame and every run, never a drifting stream. Set `sketchSeed` explicitly to pin or vary a shape's hand:

```ts
new Rect({ id: 'a', width: 100, height: 60, sketch: { kind: 'crayon' }, sketchSeed: 7 });
```

Invalid styles throw at construction (`validateSketch`, mirroring `validateFilters`): unknown `kind`, non-positive `width`, negative `roughness`, `passes < 1`.

The pure helpers are exported for custom work — `roughen(segs, style, rng)`, `flatten(segs, tolerance)` (de Casteljau + arc sampling → polylines), and `arcLength(polyline)`.

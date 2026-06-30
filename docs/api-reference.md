# API reference

> **Generated** from the live `describe()` manifest — do not edit by hand (run `pnpm docs:api`). Your INSTALLED version is the source of truth: call `glissade.describe()` (or `describe()` from `@glissade/scene/describe`) for the machine-readable form at your version, and `describe({ examples: true })` after `import '@glissade/scene/examples'` for the runnable snippets below. Every snippet here is executed by the doctest harness in CI, so it cannot drift from the API.

> **No-build (`<script src>`) consumers:** the snippets use npm `import` form. On the IIFE every export is `window.glissade.<name>` — replace `import { Rect, timeline } from '@glissade/scene'` with `const { Rect, timeline } = window.glissade` (or call `window.glissade.Rect` directly).

## Nodes

Each node lists its props: **animatable** props carry a track `target` (`<id>/<path>`); the rest are construction-only.

### Group

Default `position` anchor: `none (no intrinsic box — anchor warns and is ignored)`.

| Prop | Type | Animatable | Track target |
| --- | --- | --- | --- |
| `position` | `vec2` | yes | `<id>/position` |
| `position.x` | `number` | yes | `<id>/position.x` |
| `position.y` | `number` | yes | `<id>/position.y` |
| `rotation` | `number` | yes | `<id>/rotation` |
| `scale` | `vec2` | yes | `<id>/scale` |
| `scale.x` | `number` | yes | `<id>/scale.x` |
| `scale.y` | `number` | yes | `<id>/scale.y` |
| `opacity` | `number` | yes | `<id>/opacity` |
| `zIndex` | `number` | yes | `<id>/zIndex` |
| `id` | `string` | no | — |
| `blend` | `BlendMode` | no | — |
| `filters` | `FilterSpec[]` | no | — |
| `anchor` | `'center'\|'top-left'\|'top'\|'top-right'\|'left'\|'right'\|'bottom-left'\|'bottom'\|'bottom-right'\|[ax,ay]` | no | — |
| `cache` | `boolean` | no | — |
| `children` | `Node[]` | no | — |

```ts
import { Group, Rect, Text } from '@glissade/scene';
// a Group nests its children as one unit (and renders as a wrapper <div> on the DOM tier)
new Group({ id: 'card', children: [
  new Rect({ anchor: 'top-left', position: [0, 0], width: 240, height: 96, fill: '#0f172a', cornerRadius: 16 }),
  new Text({ anchor: 'top-left', position: [16, 16], text: 'Title', fontSize: 24, fill: '#f8fafc' }),
] });
```

### Rect

Default `position` anchor: `center`.

| Prop | Type | Animatable | Track target |
| --- | --- | --- | --- |
| `position` | `vec2` | yes | `<id>/position` |
| `position.x` | `number` | yes | `<id>/position.x` |
| `position.y` | `number` | yes | `<id>/position.y` |
| `rotation` | `number` | yes | `<id>/rotation` |
| `scale` | `vec2` | yes | `<id>/scale` |
| `scale.x` | `number` | yes | `<id>/scale.x` |
| `scale.y` | `number` | yes | `<id>/scale.y` |
| `opacity` | `number` | yes | `<id>/opacity` |
| `zIndex` | `number` | yes | `<id>/zIndex` |
| `fill` | `color\|paint` | yes | `<id>/fill` |
| `stroke` | `color` | yes | `<id>/stroke` |
| `strokeWidth` | `number` | yes | `<id>/strokeWidth` |
| `reveal` | `number` | yes | `<id>/reveal` |
| `width` | `number` | yes | `<id>/width` |
| `height` | `number` | yes | `<id>/height` |
| `cornerRadius` | `number` | yes | `<id>/cornerRadius` |
| `id` | `string` | no | — |
| `blend` | `BlendMode` | no | — |
| `filters` | `FilterSpec[]` | no | — |
| `anchor` | `'center'\|'top-left'\|'top'\|'top-right'\|'left'\|'right'\|'bottom-left'\|'bottom'\|'bottom-right'\|[ax,ay]` | no | — |
| `cache` | `boolean` | no | — |
| `sketch` | `SketchStyle` | no | — |
| `sketchFill` | `HachureSpec` | no | — |
| `sketchSeed` | `number` | no | — |

```ts
import { Rect } from '@glissade/scene';
new Rect({ position: [160, 100], width: 200, height: 100, fill: '#3b82f6', cornerRadius: 12 });
```

### Circle

Default `position` anchor: `center`.

| Prop | Type | Animatable | Track target |
| --- | --- | --- | --- |
| `position` | `vec2` | yes | `<id>/position` |
| `position.x` | `number` | yes | `<id>/position.x` |
| `position.y` | `number` | yes | `<id>/position.y` |
| `rotation` | `number` | yes | `<id>/rotation` |
| `scale` | `vec2` | yes | `<id>/scale` |
| `scale.x` | `number` | yes | `<id>/scale.x` |
| `scale.y` | `number` | yes | `<id>/scale.y` |
| `opacity` | `number` | yes | `<id>/opacity` |
| `zIndex` | `number` | yes | `<id>/zIndex` |
| `fill` | `color\|paint` | yes | `<id>/fill` |
| `stroke` | `color` | yes | `<id>/stroke` |
| `strokeWidth` | `number` | yes | `<id>/strokeWidth` |
| `reveal` | `number` | yes | `<id>/reveal` |
| `radius` | `number` | yes | `<id>/radius` |
| `id` | `string` | no | — |
| `blend` | `BlendMode` | no | — |
| `filters` | `FilterSpec[]` | no | — |
| `anchor` | `'center'\|'top-left'\|'top'\|'top-right'\|'left'\|'right'\|'bottom-left'\|'bottom'\|'bottom-right'\|[ax,ay]` | no | — |
| `cache` | `boolean` | no | — |
| `sketch` | `SketchStyle` | no | — |
| `sketchFill` | `HachureSpec` | no | — |
| `sketchSeed` | `number` | no | — |

```ts
import { Circle } from '@glissade/scene';
new Circle({ position: [160, 100], radius: 48, fill: '#ef4444' });
```

### Path

Default `position` anchor: `author-coords`.

| Prop | Type | Animatable | Track target |
| --- | --- | --- | --- |
| `position` | `vec2` | yes | `<id>/position` |
| `position.x` | `number` | yes | `<id>/position.x` |
| `position.y` | `number` | yes | `<id>/position.y` |
| `rotation` | `number` | yes | `<id>/rotation` |
| `scale` | `vec2` | yes | `<id>/scale` |
| `scale.x` | `number` | yes | `<id>/scale.x` |
| `scale.y` | `number` | yes | `<id>/scale.y` |
| `opacity` | `number` | yes | `<id>/opacity` |
| `zIndex` | `number` | yes | `<id>/zIndex` |
| `fill` | `color\|paint` | yes | `<id>/fill` |
| `stroke` | `color` | yes | `<id>/stroke` |
| `strokeWidth` | `number` | yes | `<id>/strokeWidth` |
| `reveal` | `number` | yes | `<id>/reveal` |
| `d` | `path` | yes | `<id>/d` |
| `id` | `string` | no | — |
| `blend` | `BlendMode` | no | — |
| `filters` | `FilterSpec[]` | no | — |
| `anchor` | `'center'\|'top-left'\|'top'\|'top-right'\|'left'\|'right'\|'bottom-left'\|'bottom'\|'bottom-right'\|[ax,ay]` | no | — |
| `cache` | `boolean` | no | — |
| `sketch` | `SketchStyle` | no | — |
| `sketchFill` | `HachureSpec` | no | — |
| `sketchSeed` | `number` | no | — |

```ts
import { Path } from '@glissade/scene';
import { pathFromSvg } from '@glissade/scene/path';
// Path.data wants a PathValue — parse an SVG `d` string with pathFromSvg (NOT a raw string)
new Path({ data: pathFromSvg('M0 0 L100 0 L50 80 Z'), fill: '#10b981' });
```

### Text

Default `position` anchor: `baseline-left`.

| Prop | Type | Animatable | Track target |
| --- | --- | --- | --- |
| `position` | `vec2` | yes | `<id>/position` |
| `position.x` | `number` | yes | `<id>/position.x` |
| `position.y` | `number` | yes | `<id>/position.y` |
| `rotation` | `number` | yes | `<id>/rotation` |
| `scale` | `vec2` | yes | `<id>/scale` |
| `scale.x` | `number` | yes | `<id>/scale.x` |
| `scale.y` | `number` | yes | `<id>/scale.y` |
| `opacity` | `number` | yes | `<id>/opacity` |
| `zIndex` | `number` | yes | `<id>/zIndex` |
| `width` | `number` | yes | `<id>/width` |
| `text` | `string` | yes | `<id>/text` |
| `fill` | `color` | yes | `<id>/fill` |
| `fontSize` | `number` | yes | `<id>/fontSize` |
| `reveal` | `number` | yes | `<id>/reveal` |
| `revealFraction` | `number` | yes | `<id>/revealFraction` |
| `fontAxes` | `fontAxes` | yes | `<id>/fontAxes` |
| `id` | `string` | no | — |
| `blend` | `BlendMode` | no | — |
| `filters` | `FilterSpec[]` | no | — |
| `anchor` | `'center'\|'top-left'\|'top'\|'top-right'\|'left'\|'right'\|'bottom-left'\|'bottom'\|'bottom-right'\|[ax,ay]` | no | — |
| `cache` | `boolean` | no | — |
| `fontFamily` | `string` | no | — |
| `fontWeight` | `number` | no | — |
| `fontStyle` | `'normal'\|'italic'` | no | — |
| `align` | `'left'\|'center'\|'right'` | no | — |
| `lineHeight` | `number` | no | — |
| `fontVariationSettings` | `string` | no | — |
| `letterSpacing` | `number` | no | — |

```ts
import { Text } from '@glissade/scene';
// position anchors at the baseline-left by default; set `anchor` to share a corner with a shape
new Text({ position: [40, 60], text: 'Hello', fontSize: 32, fill: '#111827' });
```

### Image

Default `position` anchor: `center`.

| Prop | Type | Animatable | Track target |
| --- | --- | --- | --- |
| `position` | `vec2` | yes | `<id>/position` |
| `position.x` | `number` | yes | `<id>/position.x` |
| `position.y` | `number` | yes | `<id>/position.y` |
| `rotation` | `number` | yes | `<id>/rotation` |
| `scale` | `vec2` | yes | `<id>/scale` |
| `scale.x` | `number` | yes | `<id>/scale.x` |
| `scale.y` | `number` | yes | `<id>/scale.y` |
| `opacity` | `number` | yes | `<id>/opacity` |
| `zIndex` | `number` | yes | `<id>/zIndex` |
| `width` | `number` | yes | `<id>/width` |
| `height` | `number` | yes | `<id>/height` |
| `id` | `string` | no | — |
| `blend` | `BlendMode` | no | — |
| `filters` | `FilterSpec[]` | no | — |
| `anchor` | `'center'\|'top-left'\|'top'\|'top-right'\|'left'\|'right'\|'bottom-left'\|'bottom'\|'bottom-right'\|[ax,ay]` | no | — |
| `cache` | `boolean` | no | — |
| `assetId` *(required)* | `string` | no | — |

```ts
import { Image } from '@glissade/scene';
// `assetId` names a media entry declared on the Timeline: timeline({ assets: { hero: { kind: 'image', url } } })
new Image({ assetId: 'hero', position: [160, 100], width: 200, height: 120 });
```

### Video

Default `position` anchor: `center`.

| Prop | Type | Animatable | Track target |
| --- | --- | --- | --- |
| `position` | `vec2` | yes | `<id>/position` |
| `position.x` | `number` | yes | `<id>/position.x` |
| `position.y` | `number` | yes | `<id>/position.y` |
| `rotation` | `number` | yes | `<id>/rotation` |
| `scale` | `vec2` | yes | `<id>/scale` |
| `scale.x` | `number` | yes | `<id>/scale.x` |
| `scale.y` | `number` | yes | `<id>/scale.y` |
| `opacity` | `number` | yes | `<id>/opacity` |
| `zIndex` | `number` | yes | `<id>/zIndex` |
| `width` | `number` | yes | `<id>/width` |
| `height` | `number` | yes | `<id>/height` |
| `id` | `string` | no | — |
| `blend` | `BlendMode` | no | — |
| `filters` | `FilterSpec[]` | no | — |
| `anchor` | `'center'\|'top-left'\|'top'\|'top-right'\|'left'\|'right'\|'bottom-left'\|'bottom'\|'bottom-right'\|[ax,ay]` | no | — |
| `cache` | `boolean` | no | — |
| `assetId` *(required)* | `string` | no | — |
| `at` | `number` | no | — |
| `trimStart` | `number` | no | — |
| `playbackRate` | `number` | no | — |
| `clipDuration` | `number` | no | — |
| `sourceFps` | `number` | no | — |

### Layout

Import from `@glissade/scene/layout`. Default `position` anchor: `top-left`.

| Prop | Type | Animatable | Track target |
| --- | --- | --- | --- |
| `position` | `vec2` | yes | `<id>/position` |
| `position.x` | `number` | yes | `<id>/position.x` |
| `position.y` | `number` | yes | `<id>/position.y` |
| `rotation` | `number` | yes | `<id>/rotation` |
| `scale` | `vec2` | yes | `<id>/scale` |
| `scale.x` | `number` | yes | `<id>/scale.x` |
| `scale.y` | `number` | yes | `<id>/scale.y` |
| `opacity` | `number` | yes | `<id>/opacity` |
| `zIndex` | `number` | yes | `<id>/zIndex` |
| `id` | `string` | no | — |
| `blend` | `BlendMode` | no | — |
| `filters` | `FilterSpec[]` | no | — |
| `anchor` | `'center'\|'top-left'\|'top'\|'top-right'\|'left'\|'right'\|'bottom-left'\|'bottom'\|'bottom-right'\|[ax,ay]` | no | — |
| `cache` | `boolean` | no | — |
| `width` | `number` | yes | `<id>/width` |
| `height` | `number` | yes | `<id>/height` |
| `gap` | `number` | yes | `<id>/gap` |
| `padding` | `number` | yes | `<id>/padding` |
| `direction` | `'row'\|'column'` | no | — |
| `justify` | `'start'\|'center'\|'end'\|'space-between'\|'space-around'` | no | — |
| `align` | `'start'\|'center'\|'end'\|'stretch'` | no | — |
| `children` | `Node[]` | no | — |

### Stack

Import from `@glissade/scene/layout`. Default `position` anchor: `top-left`.

| Prop | Type | Animatable | Track target |
| --- | --- | --- | --- |
| `position` | `vec2` | yes | `<id>/position` |
| `position.x` | `number` | yes | `<id>/position.x` |
| `position.y` | `number` | yes | `<id>/position.y` |
| `rotation` | `number` | yes | `<id>/rotation` |
| `scale` | `vec2` | yes | `<id>/scale` |
| `scale.x` | `number` | yes | `<id>/scale.x` |
| `scale.y` | `number` | yes | `<id>/scale.y` |
| `opacity` | `number` | yes | `<id>/opacity` |
| `zIndex` | `number` | yes | `<id>/zIndex` |
| `id` | `string` | no | — |
| `blend` | `BlendMode` | no | — |
| `filters` | `FilterSpec[]` | no | — |
| `anchor` | `'center'\|'top-left'\|'top'\|'top-right'\|'left'\|'right'\|'bottom-left'\|'bottom'\|'bottom-right'\|[ax,ay]` | no | — |
| `cache` | `boolean` | no | — |
| `width` | `number` | yes | `<id>/width` |
| `height` | `number` | yes | `<id>/height` |
| `gap` | `number` | yes | `<id>/gap` |
| `padding` | `number` | yes | `<id>/padding` |
| `direction` | `'row'\|'column'` | no | — |
| `justify` | `'start'\|'center'\|'end'\|'space-between'\|'space-around'` | no | — |
| `align` | `'start'\|'center'\|'end'\|'stretch'` | no | — |
| `children` | `Node[]` | no | — |

```ts
import { Rect } from '@glissade/scene';
import { Stack, loadYogaLayoutEngine } from '@glissade/scene/layout';
// flexbox via Yoga — load the engine ONCE before evaluating any layout scene:
// await loadYogaLayoutEngine();
Stack({ direction: 'row', gap: 16, children: [new Rect({ width: 80, height: 80 }), new Rect({ width: 80, height: 80 })] });
```

### Row

Import from `@glissade/scene/layout`. Default `position` anchor: `top-left`.

| Prop | Type | Animatable | Track target |
| --- | --- | --- | --- |
| `position` | `vec2` | yes | `<id>/position` |
| `position.x` | `number` | yes | `<id>/position.x` |
| `position.y` | `number` | yes | `<id>/position.y` |
| `rotation` | `number` | yes | `<id>/rotation` |
| `scale` | `vec2` | yes | `<id>/scale` |
| `scale.x` | `number` | yes | `<id>/scale.x` |
| `scale.y` | `number` | yes | `<id>/scale.y` |
| `opacity` | `number` | yes | `<id>/opacity` |
| `zIndex` | `number` | yes | `<id>/zIndex` |
| `id` | `string` | no | — |
| `blend` | `BlendMode` | no | — |
| `filters` | `FilterSpec[]` | no | — |
| `anchor` | `'center'\|'top-left'\|'top'\|'top-right'\|'left'\|'right'\|'bottom-left'\|'bottom'\|'bottom-right'\|[ax,ay]` | no | — |
| `cache` | `boolean` | no | — |
| `width` | `number` | yes | `<id>/width` |
| `height` | `number` | yes | `<id>/height` |
| `gap` | `number` | yes | `<id>/gap` |
| `padding` | `number` | yes | `<id>/padding` |
| `direction` | `'row'\|'column'` | no | — |
| `justify` | `'start'\|'center'\|'end'\|'space-between'\|'space-around'` | no | — |
| `align` | `'start'\|'center'\|'end'\|'stretch'` | no | — |
| `children` | `Node[]` | no | — |

### Column

Import from `@glissade/scene/layout`. Default `position` anchor: `top-left`.

| Prop | Type | Animatable | Track target |
| --- | --- | --- | --- |
| `position` | `vec2` | yes | `<id>/position` |
| `position.x` | `number` | yes | `<id>/position.x` |
| `position.y` | `number` | yes | `<id>/position.y` |
| `rotation` | `number` | yes | `<id>/rotation` |
| `scale` | `vec2` | yes | `<id>/scale` |
| `scale.x` | `number` | yes | `<id>/scale.x` |
| `scale.y` | `number` | yes | `<id>/scale.y` |
| `opacity` | `number` | yes | `<id>/opacity` |
| `zIndex` | `number` | yes | `<id>/zIndex` |
| `id` | `string` | no | — |
| `blend` | `BlendMode` | no | — |
| `filters` | `FilterSpec[]` | no | — |
| `anchor` | `'center'\|'top-left'\|'top'\|'top-right'\|'left'\|'right'\|'bottom-left'\|'bottom'\|'bottom-right'\|[ax,ay]` | no | — |
| `cache` | `boolean` | no | — |
| `width` | `number` | yes | `<id>/width` |
| `height` | `number` | yes | `<id>/height` |
| `gap` | `number` | yes | `<id>/gap` |
| `padding` | `number` | yes | `<id>/padding` |
| `direction` | `'row'\|'column'` | no | — |
| `justify` | `'start'\|'center'\|'end'\|'space-between'\|'space-around'` | no | — |
| `align` | `'start'\|'center'\|'end'\|'stretch'` | no | — |
| `children` | `Node[]` | no | — |

## Timeline builder

Methods on the `timeline(tl => …)` builder (and the object form). See [Composing timelines](./timeline) for the mental model.

### `to`

```ts
to<T>(target, value, opts?: { duration?, ease?, at?, from?, type? }): TimelineBuilder  —  type is the value-type escape hatch (e.g. { type: 'fontAxes' } for a { wght } map inferValueType can't name)
```

```ts
import { timeline } from '@glissade/core';
// `from` anchors the start; the per-target cursor advances by `duration`
timeline((tl) => tl.to('card/position', [200, 100], { duration: 1, from: [0, 0] }));
```

### `fromTo`

```ts
fromTo<T>(target, from, to, opts?: { duration?, ease?, at?, type? }): TimelineBuilder
```

```ts
import { timeline } from '@glissade/core';
timeline((tl) => tl.fromTo('card/opacity', 0, 1, { duration: 0.5 }));
```

### `stagger`

```ts
stagger<T>(targets, { to: T | ((index, count) => T), from?: T | ((index, count) => T), duration?, ease? }, { each: number | ((rank, count) => number), anchor?, at? }): TimelineBuilder
```

```ts
import { timeline } from '@glissade/core';
// one tween per target, cascaded by `each`; `anchor` picks where the cascade ranks from
timeline((tl) => tl.stagger(['a/opacity', 'b/opacity', 'c/opacity'], { to: 1, from: 0, duration: 0.4 }, { each: 0.1 }));
```

### `tracks`

```ts
tracks(tracks: Track[] | { tracks: Track[] }): TimelineBuilder
```

```ts
import { timeline, track, key } from '@glissade/core';
// attach raw keyframe tracks (the value type is the 2nd arg)
timeline((tl) => tl.tracks([track('card/x', 'number', [key(0, 0), key(1, 100)])]));
```

### `set`

```ts
set<T>(target, value, opts?: { at?, type? }): TimelineBuilder
```

```ts
import { timeline } from '@glissade/core';
// a hold key — the value snaps at the resolved position
timeline((tl) => tl.set('card/fill', '#ef4444', { at: 0.5 }));
```

### `label`

```ts
label(name, at?): TimelineBuilder
```

### `add`

```ts
add(child, at?, opts?: { mode?: 'add'|'sync', timeScale? }): TimelineBuilder
```

### `sequence`

```ts
sequence(subs, opts?: { gap? }): TimelineBuilder
```

### `at`

```ts
at(time, sub): TimelineBuilder
```

### `call`

```ts
call(fn, at?): TimelineBuilder
```

### `cue`

```ts
cue(at, name, data?): TimelineBuilder
```

### `adBreak`

```ts
adBreak(at, opts?: { id?, duration? }): TimelineBuilder
```

### `editable`

```ts
editable(): TimelineBuilder
```

### `editableDuration`

```ts
editableDuration(): TimelineBuilder
```

## Helpers

Free functions beyond the node taxonomy — transport, motion-path, clips, snapshot, text-splitting. On the IIFE each is `window.glissade.<name>`.

### `measureWrappedText`

Measure how a STRING wraps to a width — size a bubble/card to wrapped text WITHOUT a Text node or re-implementing line breaking (uses the renderer's own wrapper). For a Text NODE, use text.measuredSize(measurer)/lineBoxes(measurer)/wordBoxes(measurer) instead.

Import from `@glissade/scene`.

```ts
scene.measureWrappedText(text, font, width, lineHeight = 1.25): { width, lines: string[], height, ascent, descent }  —  node-free; or measureWrappedText(text, font, width, lineHeight, measurer) standalone. width<=0 = no wrap (only explicit \n). Text node analogue: text.measuredSize(measurer) -> { w, h }.
```

```ts
import { createScene } from '@glissade/scene';
// size a bubble/card to wrapped text WITHOUT a Text node (the FontSpec field is `size`, not `fontSize`)
const scene = createScene({ size: { w: 400, h: 200 }, children: [] });
const { width, lines, height } = scene.measureWrappedText('a long string that wraps across the box', { family: 'sans-serif', size: 24 }, 280);
```

### `createPlayer`

Build the transport object (play / pause / seek / rate / loop / marker + cue callbacks) directly — what mount() returns as mounted.player.

Import from `@glissade/player`.

```ts
createPlayer({ playhead: createPlayhead(), duration: 2 }, { loop?: boolean }): Player  —  player.play() → { finished }, player.pause(), player.seek(u), player.rate = 2, player.onMarker(name, cb), player.onCue(kind, cb)
```

### `mount`

The one-call embed: builds the player, the backend, the rAF render loop, and font handling for you — start here. Returns { player } among other handles.

Import from `@glissade/player`.

```ts
mount(scene, timeline, canvas, opts?: { loop?: boolean }): { player: Player, ... }
```

### `motionPath`

Build an arc-length sampler over a path — a pure, deterministic table you read points and tangents from by normalized progress (constant speed, not bezier parameter).

Import from `@glissade/scene/motion`.

```ts
motionPath(path: PathValue): { length, atProgress(u): [x,y], tangentAtProgress(u): [x,y] }
```

```ts
import { motionPath } from '@glissade/scene/motion';
import { pathFromSvg } from '@glissade/scene/path';
const mp = motionPath(pathFromSvg('M0 0 C50 0 50 100 100 100'));
const pointHalfway = mp.atProgress(0.5); // { x, y }
```

### `followPath`

A companion node that makes a target ride a path as an animatable — it owns the target position (and rotation with orient) and exposes a progress you drive with a track.

Import from `@glissade/scene/motion`.

```ts
followPath(target: Node, path: Node, opts?: { id?, orient?: boolean }): FollowPath  —  drive '<id>/progress' with a track
```

### `clip`

A reusable, target-agnostic motion captured once as a relative-time key schedule, then applied to a node at a wall-clock start time. Build-time sugar: clip.apply() compiles to ordinary Track[].

Import from `@glissade/core/clips`.

```ts
clip({ channels: { <name>: { path, keys: [key(t, value, ease?)] } } }): Clip  —  clip.apply(nodeId, startT) → { tracks, end }
```

### `clipList`

Fan one clip across many targets, staggered, in a single call — returns the combined Track[].

Import from `@glissade/core/clips`.

```ts
clipList(clip: Clip, targets: string[], startT: number, opts?: { stagger?: number }): { tracks }
```

### `renderToDataURL`

Capture a single frame as a PNG/WebP data URL — evaluate → render → data-URL, the no-build screenshot DX helper. Browser-only.

Import from `@glissade/backend-canvas2d/snapshot`.

```ts
renderToDataURL(scene, timeline, t, opts?): string  (data: URL)
```

### `snapshotCanvas`

Render a single frame onto a canvas you pass in (the lower-level primitive renderToDataURL is built on). Browser-only.

Import from `@glissade/backend-canvas2d/snapshot`.

```ts
snapshotCanvas(scene, timeline, t, canvas, opts?): void
```

### `splitText`

Split a Text node into per-word / per-line / per-grapheme parts you can animate individually (kinetic typography). Pass { measurer } (or call setTextMeasurer first) so part geometry uses the real backend, not the estimating fallback. Tree-shaken off the base scene index.

Import from `@glissade/scene/type`.

```ts
splitText(text: Text | TextProps, opts?: { by?: 'word'|'line'|'grapheme', id?: string, measurer?: TextMeasurer }): { node: Group, children: Text[], parts: SplitPart[], targets(prop): string[] }
```

```ts
import { splitText } from '@glissade/scene/type';
// the source needs an `id` — parts bind tracks against `<id>/<i>`. sp.targets('opacity') gives the reveal-recipe targets
const sp = splitText({ id: 'title', text: 'Hello', fontSize: 40 }, { by: 'grapheme' });
```

### `Grid`

Build-time CSS-grid-style track resolver: position plain children into a column grid (fr/px tracks + gaps), returning a Group. Pure fan-out (no Yoga, no new target) — the goldens hold by construction. Tree-shaken off the base scene index.

Import from `@glissade/scene/grid`.

```ts
Grid({ columns: number | (number | { fr })[], children: Node[], gap?, columnGap?, rowGap?, cellHeight?, width? }): Group  —  child[i] → row floor(i/cols), col i%cols
```

```ts
import { Rect } from '@glissade/scene';
import { Grid } from '@glissade/scene/grid';
// build-time fan-out into a column grid (no Yoga) — children move to cell centers.
// fr columns (`columns: 3`) need a `width` to resolve against; `cellHeight` is the row pitch
Grid({ columns: 3, width: 360, gap: 16, cellHeight: 80, children: [new Rect({ width: 80, height: 60 }), new Rect({ width: 80, height: 60 })] });
```

### `Stack`

Yoga-flexbox layout factory (column by default) — a Layout subclass that stacks children with gap/padding/justify/align. Needs loadYogaLayoutEngine() before mount/render. On the @glissade/scene/layout subpath.

Import from `@glissade/scene/layout`.

```ts
Stack({ children, direction?: 'row'|'column', gap?, padding?, justify?, align? }): Layout
```

```ts
import { Rect } from '@glissade/scene';
import { Stack, loadYogaLayoutEngine } from '@glissade/scene/layout';
// flexbox via Yoga — load the engine ONCE before evaluating any layout scene:
// await loadYogaLayoutEngine();
Stack({ direction: 'row', gap: 16, children: [new Rect({ width: 80, height: 80 }), new Rect({ width: 80, height: 80 })] });
```

### `Row`

Yoga-flexbox layout factory pinned to direction:"row" — children laid out horizontally. Needs loadYogaLayoutEngine() before mount/render. On the @glissade/scene/layout subpath.

Import from `@glissade/scene/layout`.

```ts
Row({ children, gap?, padding?, justify?, align? }): Layout
```

### `Column`

Yoga-flexbox layout factory pinned to direction:"column" — children laid out vertically. Needs loadYogaLayoutEngine() before mount/render. On the @glissade/scene/layout subpath.

Import from `@glissade/scene/layout`.

```ts
Column({ children, gap?, padding?, justify?, align? }): Layout
```

## createScene

```ts
createScene({ size: { w, h }, children: Node[] }): Scene  —  media assets are declared on the Timeline document: timeline({ assets: { <id>: { kind: 'image'|'video', url } } }); an Image/Video node's `assetId` names an entry here.
```

## Value types

Registered interpolation types a track may declare (the 2nd arg to `track(target, type, keys)`):

`number` · `vec2` · `vec2-arc` · `color` · `string` · `boolean` · `path` · `paint` · `fontAxes`

## Easings

Easing functions for `to(…, { ease: easings.<name> })` (functions, not string names):

`linear` · `easeInQuad` · `easeOutQuad` · `easeInOutQuad` · `easeInCubic` · `easeOutCubic` · `easeInOutCubic` · `easeInQuart` · `easeOutQuart` · `easeInOutQuart` · `easeInQuint` · `easeOutQuint` · `easeInOutQuint` · `easeInSine` · `easeOutSine` · `easeInOutSine` · `easeInExpo` · `easeOutExpo` · `easeInOutExpo` · `easeInCirc` · `easeOutCirc` · `easeInOutCirc` · `easeInBack` · `easeOutBack` · `easeInOutBack` · `easeInElastic` · `easeOutElastic` · `easeInOutElastic` · `easeInBounce` · `easeOutBounce` · `easeInOutBounce`

## Tree-shakeable subpaths

| Subpath | Contents |
| --- | --- |
| `@glissade/core/clips` | motion clips: clip/clipList + the popIn/slideIn/pulse/driftLoop literals, presence (enter/exit) and morph (box-FLIP) build-time sugar. |
| `@glissade/core/i18n` | localization: requireParity (id-set diff), localize (doc→doc resolver), t() ambient-table sugar. |
| `@glissade/scene/layout` | flexbox: the Yoga-backed Layout node + LayoutEngine (the only entry that ships Yoga wasm). |
| `@glissade/scene/path` | SVG geometry: pathFromSvg / parseSvgPathData — parse an SVG `d` string into a PathValue for Path.data. |

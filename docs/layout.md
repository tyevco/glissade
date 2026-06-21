# Flexbox layout

Most glissade nodes are placed by their `position` (a center-anchored point you animate directly). When you want a row of buttons, a column of labels, or a padded panel that grows to fit its content, reach for the **flexbox layout** instead: a `Layout` (or its `Stack` alias) flows its children with gap, padding, justification and alignment, computed by Yoga — the *same* engine in browser preview and headless export, so layout stays deterministic.

Layout lives on a **separate, tree-shakeable entry point** — `@glissade/scene/layout` — because Yoga ships as wasm. The base embed path never pays for it; you opt in by importing from the subpath.

```ts
import { Stack, loadYogaLayoutEngine } from '@glissade/scene/layout';
```

## Load the engine first

Yoga is wasm and loads asynchronously, but `evaluate()` is a synchronous pure function of time — it never awaits. So you must register the engine **once**, before mounting or rendering any scene that contains a layout node:

```ts
import { loadYogaLayoutEngine } from '@glissade/scene/layout';

await loadYogaLayoutEngine(); // idempotent; do this once at startup
```

If a layout node is evaluated with no engine registered, glissade throws a `LayoutEngineMissingError` pointing you back here. (The `gs` CLI calls `loadYogaLayoutEngine()` for you during `render` and `dev`.)

## `Stack` — the ergonomic column/row

`Stack` is a thin factory over `Layout` with defaults tuned for the common case: a **vertical column, left-aligned**. It is *not* a separate node type — a `Stack` is a `Layout`, so it inherits the identical memoized, pure resolve, and a `Stack(props)` produces the same positions as the equivalent hand-written `Layout({...})`.

```ts
import { Stack, loadYogaLayoutEngine } from '@glissade/scene/layout';
import { Rect, Text } from '@glissade/scene';

await loadYogaLayoutEngine();

const panel = Stack({
  direction: 'column', // the default
  gap: 16,
  padding: 24,
  width: 'auto',       // size the column from its content
  height: 'auto',
  children: [
    new Text({ id: 'title', text: 'Episode 4', fontSize: 28 }),
    new Text({ id: 'sub', text: 'The deterministic export', fontSize: 16 }),
    new Rect({ id: 'rule', width: 240, height: 2, fill: '#e6a700' }),
  ],
});
```

### Stack defaults vs. Layout defaults

`Stack` diverges from `Layout` in exactly two defaults, then passes everything else straight through:

| prop        | `Stack` default | `Layout` default |
| ----------- | --------------- | ---------------- |
| `direction` | `'column'`      | `'row'`          |
| `align`     | `'start'`       | `'center'`       |

`align: 'start'` gives a column a true left edge — every label's origin lands on the same x, which is what you want for a stacked label/caption column. A bare `Layout` centers its children instead. Reach for the underlying `Layout` directly when you want the centered/row defaults or just prefer to be explicit; everything below applies to both.

### `Row` / `Column` — named aliases

For the two common cases a named pair reads better than `Stack({ direction })`. `Row` and `Column` are trivial aliases that pin the direction; everything else is `Stack` (including its `align: 'start'` default and the identical pure, memoized resolve). `direction` is omitted from their props — it's already fixed — so `Row(props)` is byte-identical to `Stack({ ...props, direction: 'row' })`, and `Column(props)` to `Stack({ ...props, direction: 'column' })`.

```ts
import { Row, Column, loadYogaLayoutEngine } from '@glissade/scene/layout';

const labels = Column({ gap: 8, children: [/* … */] }); // a vertical, left-aligned stack
const toolbar = Row({ gap: 12, children: [/* … */] });   // a horizontal stack
```

## Container props

Both `Stack` and `Layout` accept the same props (plus all the usual node props — `id`, `position`, `opacity`, …):

- `direction` — `'row'` | `'column'`.
- `width` / `height` — a number (fixed), or `'auto'` to size the axis from content (padding + child sizes + gaps).
- `gap` — space between flowed children (animatable).
- `padding` — inner padding on all edges (animatable).
- `justify` — main-axis distribution: `'start'` | `'center'` | `'end'` | `'space-between'` | `'space-around'`.
- `align` — cross-axis alignment: `'start'` | `'center'` | `'end'` | `'stretch'`.
- `children` — the nodes to flow.

`gap`, `padding`, `width` and `height` are signals, so you can animate them from a timeline track (`'<id>/gap'`, `'<id>/padding'`, …) and the flow re-resolves — purely, with no cross-frame state.

### Auto sizing

With `width: 'auto'` or `height: 'auto'`, the container grows to fit its content. Read the resolved size back with `node.computedSize()` — a pure pull, so you can bind a sibling to it (e.g. a background `Rect` whose height tracks a growing panel) and it follows automatically:

```ts
const panel = Stack({ width: 200, height: 'auto', gap: 10, padding: 20, children: [...] });
const bg = new Rect({ width: 200, height: () => panel.computedSize().h, fill: '#181b22' });
```

### Nesting

Layouts nest: a row of columns is just a `direction: 'row'` Stack whose children are column Stacks. Auto-sized inner layouts report their computed size as their intrinsic size, so the outer flow places them correctly.

```ts
const rowOfColumns = Stack({
  direction: 'row',
  gap: 24,
  children: [
    Stack({ gap: 8, children: [/* column A */] }),
    Stack({ gap: 8, children: [/* column B */] }),
  ],
});
```

## Tree-shakeable subpaths

glissade keeps byte-heavy capabilities off the base embed budget by shipping them on dedicated entry points. Import from these subpaths to pull in only what you use:

| Import from                | What lives there                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `@glissade/scene`          | The base scene graph: `Group`, `Rect`, `Circle`, `Path`, `Text`, `Image`, `Video`, `createScene`. |
| `@glissade/scene/layout`   | Flexbox layout: `Stack`, `Layout`, `loadYogaLayoutEngine` (Yoga wasm — a separate budget).         |
| `@glissade/scene/path`     | The SVG `d`-string parser for `Path({ data: 'M0 0 L…' })` (`parseSvgPathData`, `pathFromSvg`).      |
| `@glissade/core/clips`     | Reusable motion clips: `clip`, `clipList`, `popIn`, `slideIn`, … (keyframe literals off the embed). |

If you find yourself reaching for a capability that doesn't seem to be on `@glissade/scene` or `@glissade/core`, check the subpath table above — it is probably on a tree-shaken entry.

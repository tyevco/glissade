# @glissade/scene

The scene graph and the **DisplayList IR**: nodes (Group, Rect, Circle, Path, Text, Image, Video) whose every animatable property is a signal, `createScene`, and the canonical `evaluate(scene, timeline, t) → DisplayList`. Text layout (explicit fonts, Intl.Segmenter line breaking) is deterministic across browser and headless render. Yoga flexbox lives behind the LayoutEngine seam at the separate `@glissade/scene/layout` entry — the base path never pays for wasm — including `width/height: 'auto'` content sizing and `computedSize()`. Other tree-shaken subpaths carry `splitText` (`./type`), `Grid` (`./grid`), motion-path drivers (`./motion`), the SVG `d` parser (`./path`), `Chart()` + serializable scales (`./chart`), `Gauge()`/`Meter()` radial gauges (`./gauge`), and `defineComponent()` (`./component`).

## Radial gauges — `Gauge()` / `Meter()`

Radial data-viz on the tree-shakeable `@glissade/scene/gauge` subpath (off the base embed) — a pure build-time fan-out like `Chart()`: a spec → N stroked-arc **zones** + boundary **ticks** + a **needle** + separate **labels**, returning a `Group`.

```ts
import { Gauge } from '@glissade/scene/gauge';
const g = Gauge({ id: 'trust', radius: 120, gap: 2.5, zones: [
  { extent: [-90, -30], color: '#e6a700', label: 'BLIND' },
  { extent: [-30,  30], color: '#3ddc97', label: 'CALIBRATED' },
  { extent: [ 30,  90], color: '#ff5d73', label: 'RAGE' } ]});
// authored needle: tl.to(g.targets('needle','rotation'), -70, { from: 0 })  // deg, 0 = up, + = clockwise
// or value→angle:  Meter({ id, radius, zones, value: () => sig(), domain: [0, 100] })
```

Every part is an addressable sub-id (`needle`, `zone-{i}`, `tick-{i}`, `label-{i}`, `glow`) via `g.targets(sub, prop)`; **labels draw z-above the zones**, so a zone can dim without crushing its label. `apexEmphasis` (portrait-safe) and per-zone `labelStyle` override the label defaults. Full guide: [docs/gauges.md](https://github.com/tyevco/glissade/blob/main/docs/gauges.md).

```sh
npm i @glissade/scene @glissade/core
```

```ts
import { createScene, Circle, evaluate } from '@glissade/scene';

const scene = createScene({
  size: { w: 640, h: 360 },
  children: [new Circle({ id: 'dot', radius: 40, fill: '#e6a700', position: [320, 180] })],
});
const displayList = evaluate(scene, doc, 1.25); // pure, serializable, renderer-agnostic
```

## The author→verify→fix loop

An agent authors **blind**. `assess()` (on the tree-shakeable `@glissade/scene/diagnostics` subpath) gives it eyes: one composed verdict over the whole verification suite (`validateScene` + `critique` + optional `exportFidelity` + `diff` + `certKey`), unified/deduped/prioritized.

```ts
const v = assess(scene, timeline, opts);
//  v.clean       → nothing MECHANICAL remains (the termination signal)
//  v.fixable     → warnings with an IN-BOUNDS geometry lever (the work queue)
//  v.escalated   → warnings the loop can't mechanically close (a human owns these)
//  v.certKey     → the trust handle (the render's content-address)
```

The agent drives the loop; the framework never picks a fix: **author → assess → auto-fix-geometry → re-assess → clean.** Each critique diagnostic carries per-lever `fixClass` hints — the loop auto-applies a `geometry` lever (move/resize/restack) but **never** a `content` one (shortening a caption changes MEANING). Geometry levers are feasibility-bounded: `fontSize` won't shrink below the legibility floor (`minLegiblePx`, default 6) and a resize won't grow off-canvas — when both are out of bounds the overflow **escalates** rather than converging to a "clean" but unreadable caption. `assess()` partitions this for you into `v.fixable` vs `v.escalated`.

> **`clean` is the termination signal, not the ship gate.** Ship iff `clean && v.escalated.length === 0` (or every escalated item has been reviewed into `opts.accepted`).

### Importing — two-consumer-honest

Bundler consumers: `import { assess, critique, certKey, diff } from '@glissade/scene/diagnostics'`.
No-build (IIFE) consumers: use `window.glissade.assess/critique/certKey/diff` (the composed API). The low-level classifiers `fixHintsOf`/`isGeometryFixable`/`isContentOnly` are bundler-only (not on `window.glissade`) and are already applied inside `assess()`'s partition — a no-build agent never needs them directly.

Full guide: [docs/authoring-loop.md](https://github.com/tyevco/glissade/blob/main/docs/authoring-loop.md).

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

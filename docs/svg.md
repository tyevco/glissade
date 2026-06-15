# SVG import

Bring a vector asset into a scene. `@glissade/svg` parses an SVG document into plain glissade nodes — a `Group` of `Path`/`Rect`/`Circle` shapes — so an icon, logo, or hand-drawn export becomes part of the same deterministic document you animate, render, and golden-test like anything else. The conversion is a pure function: no DOM, no browser, Node-and-browser-safe.

```ts
import { importSvg } from '@glissade/svg';

const { size, root, warnings, toSceneModule } = importSvg(svgString);

// render it as-is…
const mod = toSceneModule();

// …or pull the nodes into a bigger scene and animate them
import { createScene } from '@glissade/scene';
createScene({ size, children: [root, /* …your own nodes */] });
```

`root` is a `Group` positioned in SVG user units; `size` comes from `width`/`height`, falling back to the `viewBox` (then `100×100`). Give the group's children `id`s by editing the import output if you want to drive them from a timeline.

## What's supported

| SVG | becomes |
| --- | --- |
| `<path d>` — `M L H V C S Q T A Z` + relative variants, smooth-curve reflection | `Path` (arcs → native ellipse-arc segments) |
| `<rect>` (with `rx`/`ry`) | `Rect` |
| `<circle>` | `Circle` |
| `<ellipse>` | `Path` (ellipse arc) |
| `<line>`, `<polyline>`, `<polygon>` | `Path` |
| `<g>` | `Group`, with paint inherited by children |
| `transform` — `translate` / `scale` / `rotate` / `matrix` | the node's TRS (composed, then decomposed) |
| `fill`, `stroke`, `stroke-width` | shape paint, inherited SVG-style (default fill **black**, `none` clears) |

A `transform` is applied by wrapping the element in a `Group` carrying the decomposed translate/rotate/scale, so it composes exactly as SVG does in the parent coordinate system. `skewX`/`skewY` aren't represented in a TRS and are dropped with a warning.

## What's dropped

`text`, `image`, `use`, gradients/patterns (`url(#…)` paint), `filter`, `mask`, `clipPath`, and CSS `<style>` are **not** converted — each is skipped and noted in `warnings`. The import never throws on these; it throws only when there is no root `<svg>` element. Check `warnings` after importing if fidelity matters:

```ts
for (const w of warnings) console.warn(`svg import: ${w}`);
```

## From the CLI

`gs import` accepts `.svg` alongside Lottie `.json`:

```sh
gs import logo.svg --out src/scenes
gs render src/scenes/logo.ts --out out
```

The generated module defers to `importSvg` (the conversion's single source of truth) so re-running picks up edits to the source SVG. Replace it with hand-authored nodes whenever you want to animate individual pieces.

> Static today: the importer produces geometry, not motion. Animate it by adding your own `Timeline` tracks against the imported nodes.

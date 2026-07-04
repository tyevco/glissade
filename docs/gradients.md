# Gradients & the `Paint` type

A node's `fill` (and `Rect`/`Circle`/`Path` stroke, where a paint is accepted) is
a **`Paint`** — a solid color, a `linear` / `radial` gradient, or a scattered-point
`mesh` gradient. `Paint` is plain JSON (it serializes with no hooks), and it is an
animatable value type: a track morphs one paint into another as ordinary keyframes,
so a gradient sweep scrubs backward for free and renders byte-identical in CI.

```ts
import { Rect } from '@glissade/scene';
import { type Paint } from '@glissade/core';

// a two-stop radial soft-light disc — geometry omitted, so it defaults to the bounds
new Rect({
  id: 'glow',
  width: 150, height: 150, position: [110, 105],
  fill: { kind: 'radial', stops: [{ offset: 0, color: '#ff5d73' }, { offset: 1, color: '#12030a' }] },
});
```

The `Paint` type lives in **`@glissade/core`**; the nodes that take a `fill` are in
`@glissade/scene`.

## The four kinds

```ts
type Paint =
  | { kind: 'color'; color: string }
  | { kind: 'linear'; stops: ColorStop[]; from?: [number, number]; to?: [number, number]; interpolation?: GradientInterpolation }
  | { kind: 'radial'; stops: ColorStop[]; center?: [number, number]; radius?: number; interpolation?: GradientInterpolation }
  | { kind: 'mesh';   points: MeshPoint[]; interpolation?: MeshInterpolation; bg?: string };
```

- A **`color`** is the solid-fill sugar (a bare `fill: '#89b4fa'` string is
  accepted too and normalizes to this).
- A **`linear`** / **`radial`** gradient is a list of `ColorStop`s
  (`{ offset: 0..1, color }`). Its geometry — `from`/`to` for linear,
  `center`/`radius` for radial — is in the shape's **local** space; **omit** it and
  the raster defaults to the filled path's bounds (a vertical sweep / a
  bounds-fitted disc), which is the common case.
- A **`mesh`** is N scattered `MeshPoint`s (`{ pos: [0,1]², color }`) blended
  across the `[0,1]²` fill rectangle as one animatable fill — the native
  replacement for "N blurred blobs" (an aurora). An optional `bg` baseline color is
  a zero-weight floor so a sparse mesh doesn't smear one point across the whole
  rect.

## Stop interpolation: `linear` / `smooth` / `gaussian`

Canvas gradients interpolate *between* stops linearly in the canvas color space,
which Mach-bands a 2–3-stop soft-light fill. The `interpolation` mode on a
`linear`/`radial` gradient fixes that with no blur filter:

| `GradientInterpolation` | Look |
| --- | --- |
| `linear` *(default)* | The canvas-native ramp — **byte-identical to omitting the mode**. |
| `smooth` | A smoothstep S-curve between stops — no Mach-banding at the stops. |
| `gaussian` | A soft gaussian shoulder — melts like a wide blur with just 2–3 stops. |

`smooth` and `gaussian` work by **densifying**: at raster the stops are resampled
into a dense ramp (64 steps) eased per-segment and interpolated in **OKLab**, so a
soft-light fill reads as smooth as a blur, no filter. The resampling is pure and
deterministic — the same `(stops, mode)` always produce the same dense ramp — so
Skia stays byte-exact. `linear` is never densified.

```ts
const stops = [{ offset: 0, color: '#ffd86b' }, { offset: 1, color: '#0a0a12' }];

new Circle({ id: 'a', radius: 95, fill: { kind: 'radial', stops, radius: 95, interpolation: 'linear' } });
new Circle({ id: 'b', radius: 95, fill: { kind: 'radial', stops, radius: 95, interpolation: 'smooth' } });
new Circle({ id: 'c', radius: 95, fill: { kind: 'radial', stops, radius: 95, interpolation: 'gaussian' } });
```

The [`golden-gradient-smooth`](https://github.com/tyevco/glissade/blob/main/packages/examples/src/scenes/golden-gradient-smooth.ts)
scene pins these three identical discs side by side.

## Mesh gradients

A `mesh` blends its scattered points with one shared, deterministic CPU kernel —
**no triangulator, no SkSL** — that both backends run, so the Skia golden is
byte-exact and browser↔Skia stays SSIM-parity. The blend space is always OKLab;
`interpolation` picks the weighting:

| `MeshInterpolation` | Look |
| --- | --- |
| `smooth` *(default)* | Shepard inverse-distance weighting — sharper points. |
| `gaussian` | A pinned-sigma gaussian melt — a softer, blurrier aurora. |
| `oklab` | An alias for `smooth` (the blend space is OKLab either way). |

```ts
new Rect({
  id: 'aurora', width: 380, height: 320, position: [430, 180],
  fill: {
    kind: 'mesh',
    points: [
      { pos: [0.2, 0.25], color: '#7c3aed' },
      { pos: [0.75, 0.2], color: '#2dd4bf' },
      { pos: [0.5, 0.85], color: '#f472b6' },
    ],
    interpolation: 'smooth',
    bg: '#0a0a18',
  },
});
```

## Animating a paint

`fill` is a single signal of type `paint`, so you animate the **whole** paint on
one track — there are **no per-stop or per-point sub-targets** (`fill.stops.0` /
`fill.points.<i>.pos` do **not** resolve):

```ts
import { key, track, type Paint } from '@glissade/core';

const radialA: Paint = { kind: 'radial', stops: [{ offset: 0, color: '#ffd86b' }, { offset: 1, color: '#1a0f2e' }], center: [-90, 0], radius: 70 };
const radialB: Paint = { kind: 'radial', stops: [{ offset: 0, color: '#6bd0ff' }, { offset: 1, color: '#0a1a2e' }], center: [90, 0], radius: 170 };

// sweep the center, grow the radius, and recolor in one track
track('anim/fill', 'paint', [key(0, radialA), key(3, radialB, 'easeInOutCubic')]);
```

How pairs morph:

- **Same kind, matched shape** — `linear↔linear` / `radial↔radial` with the same
  stop count lerp each stop's offset + OKLab color plus the geometry; two
  same-point-count **meshes** lerp each point's `pos` + color **pairwise** (an
  aurora drift), with `bg` fading symmetrically through a transparent stand-in.
- **Solid → gradient** — a `color` **lifts** to a uniform gradient of the other
  keyframe's shape, so a solid fill can tween into a gradient.
- **Mismatched** — a different kind (`linear↔radial`), a different stop/point
  count, or (for a mesh) a different `interpolation` mode can't be blended
  continuously, so the track **snaps** at the keyframe boundary and emits a
  one-time warning explaining why (the blend kernel is discrete). Match the kind,
  the stop/point count, and the `interpolation` on both keyframes to morph.

## Determinism & Lottie interchange

Every paint mode is a pure function of `(stops/points, mode)` with no clock and no
randomness, and the densifier / mesh kernel are shared across backends, so a paint
samples identically at any `t` on both canvas2d and Skia — covered by the golden
corpus like any other pixel (see the `gradient`, `gradient-smooth`, and `mesh`
goldens). For **`gs export` to Lottie** (0.58):

- `linear` / `radial` gradients export to a Lottie `gf` fill; a `smooth`/`gaussian`
  ramp reuses the **same** OKLab densifier, so the exported ramp is faithful (it
  used to flatten to a hard linear ramp).
- A **`mesh`** fill has no Lottie ramp primitive: with a PNG encoder threaded (the
  CLI supplies one) it is rasterized to a static image layer; without one it warns
  and is dropped. An *animated* mesh is likewise a static raster on export —
  warned, never silently wrong.

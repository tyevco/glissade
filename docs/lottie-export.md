# Lottie export (`gs export`)

glissade can compile a scene's timeline **into Lottie/dotLottie JSON** — the inverse of
[SVG/Lottie import](/svg). Where a render produces pixels, an export produces a
*declarative animation document* that any Lottie player (lottie-web, the mobile
runtimes, After Effects via bodymovin) can play. glissade becomes an **interchange
hub**, not just a video exporter.

```sh
gs export --lottie scene.ts --out scene.json
gs export --lottie scene.ts --out scene.json --width 1080 --height 1080 --fps 30
```

`--width`/`--height` set the composition size; `--fps` defaults to the timeline's
`fps`, else 60. The output re-imports through `gs import` losslessly for the mappable
subset (round-tripped and SSIM-gated in CI).

## How it maps

Export is the shipped importer read backwards — a document→document **compile**, not a
raster dump. A `Track` targeting `<id>/<prop>` becomes an animated Lottie channel:

| glissade | Lottie channel |
| --- | --- |
| `position`, `position.x`/`.y` | transform `p` (native split form for per-axis) |
| `opacity` | transform `o` |
| `scale` | transform `s` |
| `rotation` | transform `r` |
| `fill` (solid color) | shape `fl.c` |
| `stroke`, `strokeWidth` | shape `st.c` / `st.w` |
| `Path.d` | shape `sh` path data |
| `Rect` / `Circle` geometry | shape `sh` (kappa-form contour) |

A prop with no track exports as a static value sampled at `t = 0`. Group nodes become
Lottie null layers with their children parented, so a track on a group animates the
whole subtree.

### Ease fidelity

`cubicBezier` and hold easings invert **exactly** to Lottie's departing-key `o`/`i`
handles — those round-trip byte-faithfully. glissade's named easings (`easeInOutCubic`
…), springs, and [`Expr`](/expr) formula tracks have no single-bezier Lottie
equivalent, so they are **baked to dense linear keyframes** by sampling on the frame
grid — the same discipline the importer uses for spatially-tangented position keys.
Author with `cubicBezier` eases when you want the smallest, exactest Lottie output.

## MVP scope

Export warns and drops what it can't represent, never silently (mirroring `gs import`'s
audit). Not yet exported:

- **Text** — Lottie text layers are lossy; rasterize to an image layer if you need it.
- **Gradient / mesh paint** — solid fills only for now.
- **Shaders, non-center anchors, group-opacity compositing** — Lottie parenting does
  not inherit opacity the way a glissade group does.
- **Animated primitive geometry** (`width`/`radius` tracks) is *sampled*, not
  channel-mapped.

Each of these is on the roadmap; animated-SVG and vector-PDF outputs share the same
Track→animator engine and are planned as sibling formats.

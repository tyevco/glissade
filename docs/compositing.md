# Clipping & track mattes

Two compositing tools shipped in 0.34: **`clip` on `Group`** (children paint only
inside a region) and **`trackMatte()`** (content masked by another layer's alpha
or luminance). Both are pure render-time compositing — `evaluate()` stays a pure
function of time, and the Skia render byte-compares in CI.

## Clip a group to a region

```ts
import { Group, Rect } from '@glissade/scene';

const card = new Group({
  id: 'card',
  position: [320, 180],
  clip: { w: 280, h: 170, r: 18 },   // rounded rect, centered in LOCAL space
  children: [feed],                   // paints only inside the card
});
```

The region is in the group's **local coordinates** — a `{ w, h, r?, x?, y? }`
rounded rect centered on `[x ?? 0, y ?? 0]` (matching the center-anchor
convention), or an explicit `PathSeg[]` outline (`pathFromSvg(...)` output works
directly). Children can slide, scale, and overflow freely; pixels are bitten
exactly at the region edge. Nested clips **intersect**.

Notes:

- `clip` is construction-only (not a track target) — animate the *children*
  through a static window (the marquee/ticker/reveal pattern).
- Clipping is render-only in v1: hit-testing ignores it (a clipped-out child
  still hits). Flag if that bites — it's a scoped follow-up.
- `Layout` doesn't accept `clip` (its flex pass owns its draw); wrap a Layout in
  a clipped `Group` instead.

## Track mattes

```ts
import { Circle, trackMatte } from '@glissade/scene';

// photo visible only inside the (animated!) circle
const iris = trackMatte(photo, new Circle({ id: 'mask', radius: 8, fill: '#fff' }), {
  id: 'iris',
});
tl.to('mask/radius', 120, { from: 8, duration: 1.2, ease: 'easeOutCubic' });
```

`trackMatte(content, matte, opts?)` renders the content into an isolated layer,
then composites the matte over it with `destination-in`: **content pixels
survive only where the matte is opaque.** Both subtrees are ordinary nodes — the
matte animates like anything else (a sliding shape wipes text in, a scaling
blob irises a photo, a text-shaped matte fills glyphs with animated content).

- `mode: 'alpha'` (default): the matte's opacity masks. Native on both canvas
  rasterizers — byte-exact on Skia.
- `mode: 'luma'`: the matte's **brightness** masks (white = keep, black =
  erase); a soft white→black gradient makes a feathered wipe. Neither backend
  has a native luma operator, so one shared, deterministic CPU kernel converts
  luminance → alpha (Rec.709 over straight RGBA — the mesh-kernel discipline);
  still byte-exact on Skia.
- The `destination-in` is isolated to the node's own layer — it can never erase
  siblings or the backdrop.
- Matte opacity scales the mask (a 50%-opacity matte half-reveals); matte
  `filters` apply too — `blur` on the matte feathers the mask edge.

## Determinism & backends

Skia renders of both features are **byte-exact** (golden-tested — see the
`compositing` scene in the showcase gallery). Browser↔Skia pixel parity is
**perceptual** (SSIM) at anti-aliased clip/matte edges, like every AA seam; the
DisplayList geometry is the exact cross-backend contract. `backend-dom` (the
preview tier) expresses clip natively via SVG `clipPath`; a matte has no
faithful retained-DOM analogue, so the matte layer is hidden and the wrapper is
stamped `data-approx="true"` — content shows unmasked in DOM preview, and the
real mask applies on every raster backend and on `gs render`.

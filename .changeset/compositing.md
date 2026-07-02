---
"@glissade/scene": minor
---

The compositing pair: `clip` on Group + `trackMatte()` — content clipped to a region, content masked by another layer

**`clip` on `Group`** (the OYP audit's verified gap): children paint only inside a local-space region — a `{ w, h, r?, x?, y? }` rounded rect or an explicit `PathSeg[]` outline. The region rides the *existing* `clip` DrawCommand inside the group's own layer (save/clip/children/restore), so it lands inside the cacheKey'd draw slice — a changed region can never serve a stale cached raster — and nested clips intersect. Construction-only; render-only in v1 (hit-testing unaffected); `Layout` doesn't accept it (wrap a Layout in a clipped Group).

```js
new Group({ id: 'card', clip: { w: 280, h: 170, r: 18 }, children: [feed] });
```

**`trackMatte(content, matte, { mode? })`** — the motion-craft suite's fourth and final piece: content renders into an isolated layer, then the matte composites over it with `destination-in` — pixels survive only where the matte is opaque. Both subtrees are ordinary animatable nodes (a scaling circle irises a photo, a sliding gradient bar luma-wipes text in). `mode: 'alpha'` (default) is native and byte-exact on both canvas rasterizers; `mode: 'luma'` (white = keep, black = erase) runs one shared, deterministic straight-alpha CPU kernel (Rec.709 — the mesh-kernel discipline). The `destination-in` is isolated to the node's own layer — it can never erase siblings or the backdrop. Matte opacity scales the mask; matte `filters` feather it.

**IR**: one optional `matte?: 'alpha' | 'luma'` field on `pushGroup` (the `shader?`/`cacheKey?` extension precedent) — the closed `BlendMode` union is untouched. Skia renders byte-exact (new `compositing` golden + showcase scene: a clipped card, an alpha iris, a luma wipe; all existing goldens byte-identical); browser↔Skia is perceptual at anti-aliased matte edges (SSIM corpus extended); backend-dom expresses clip natively via SVG `clipPath` and degrades matte honestly (`data-approx`, matte layer hidden). Toolchain fix folded in: @napi-rs applies the current transform to `putImageData` (against spec) — the luma kernel now resets/restores the transform around its write-back. Docs: `docs/compositing.md`; DESIGN.md carries the full decision record.

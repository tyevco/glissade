---
'@glissade/scene': minor
'@glissade/browser': minor
---

feat(scene,browser): `describe()` construction-completeness — construction props + layout nodes + assets map + negative-space guard

`glissade.describe()` now describes **construction + animation**, not just
animation. Two AI-consumer canaries independently converged on the same gap: the
pre.5 manifest listed only ANIMATABLE props (those from `registerTarget`), so an
AI could not *construct* a node from it (no `assetId`, no `fontFamily`, no layout
nodes). Still PURE INTROSPECTION — every golden is byte-identical, and `describe`
stays tree-shaken off the base embed path (base embed UNCHANGED at 38.15 kB gz).

- **Non-animatable construction props** are now in the manifest, flagged
  `{ animatable: false }` with NO `target`:
  - Image/Video `assetId` — `{ type:'string', animatable:false, required:true }`
    (you cannot construct the node without it; the media URL lives in the
    Timeline `assets` map, keyed by this id).
  - Text `fontFamily`/`align`/`anchor` (and `fontWeight`/`fontStyle`/`lineHeight`)
    — construction-only; `fontSize`/`text`/`fill`/`width`/`reveal` stay animatable
    targets.
  - Shape `sketch`/`sketchFill`/`sketchSeed`, Video clip props
    (`at`/`trimStart`/`playbackRate`/`clipDuration`/`sourceFps`), Group/Layout
    `children`, and the shared base-`NodeProps` set (`id`/`blend`/`filters`/
    `anchor`/`cache`).
- **Layout family** (`Layout`/`Stack`/`Row`/`Column`) are now first-class
  `.nodes` entries, each tagged with `subpath: '@glissade/scene/layout'`. Their
  `width`/`height`/`gap`/`padding` are animatable targets;
  `direction`/`justify`/`align`/`children` are construction.
- **`createScene`** surfaces the asset manifest shape: media is declared on the
  Timeline document via `timeline({ assets: { <id>: { kind:'image'|'video', url
  } } })`, and an Image/Video node's `assetId` names an entry there.
- **`stagger`** signature shows the non-uniform form:
  `each: number | ((rank, count) => number)`.

**Negative-space guard** (the manifest's core value — the targets it does NOT
list): a `{ animatable:false }` prop is never a real track target. A new test
affirmatively confirms that binding a track to a construction-only prop
(`<id>/assetId`, `<id>/fontFamily`) is REJECTED by the bind guard, so an
accidentally-animatable construction prop is caught. A drift guard constructs
each node from exactly the manifest's construction props (the constructor must
accept them) and asserts no construction prop name collides with an animatable
target.

The richer manifest pushed the single-file `@glissade/browser` convenience
bundle from 44.48 → 45.09 kB gz; its budget moved 45 → 46 kB (the base embed is
unaffected — `describe` is not on it).

---
'@glissade/scene': minor
'@glissade/core': patch
---

0.19 pre.5 — splitText part-handle ergonomics + a forgiving `tl.tracks` (no render change; the 262 goldens stay byte-identical — this is API shape + docs):

- **`SplitPart.id`** (`@glissade/scene/type`). Each part now carries `id` — the child node's registered `${id}/${i}` (the SAME string the child `Text` was constructed with). The advertised kinetic-typography recipe `parts.map((p) => `${p.id}/revealFraction`)` now works verbatim instead of yielding `undefined/revealFraction` (the part shape was previously `{ text, node, line, box }` with no `id`, so the headline split→stagger recipe couldn't bind).
- **`SplitTextResult.targets(prop)`** — returns the bind-ready ids `[`${id}/0/${prop}`, `${id}/1/${prop}`, …]` in reading order, so the recipe is one line: `tl.stagger(split.targets('revealFraction'), { from: 0, to: 1 }, { each: 0.1 })`.
- **`tl.tracks` accepts a clip-tier RESULT object** (`@glissade/core`). `tl.tracks(presence(...))` previously threw "{} is not iterable" — you had to pass `.tracks`. It now accepts both a raw `Track[]` and a `{ tracks: Track[] }` result (presence/clip/each/morph all return the object), unwrapping `.tracks` for you.
- **Docs:** `docs/typewriter.md` shows the `split.targets('revealFraction')` + `part.id` recipe and that `{ measurer }` is required for exact layout; `docs/browser.md` states `renderToDataURL` returns a `Promise<string>` (await it).

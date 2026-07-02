# Reviewing goldens (`gs repin`)

Byte-exact golden PNGs are glissade's determinism contract, but they have a
painful failure mode in a **narrated** project: re-record one line and every
downstream beat re-flows, so all of a project's goldens go stale at once. Re-pin
them blindly with `vitest -u` and a regression can ride along inside a change you
*thought* was just a timing shift.

`gs repin` (0.37) is the reviewer for exactly that moment. It renders the current
scene frame-by-frame against the committed goldens and, for every frame that
changed, tells you **how much** it changed, **where**, and **why** — then re-pins
only the frames you allow.

```sh
# dry-run review: what changed, and what caused it (writes nothing)
gs repin scenes/episode-03.ts --golden test/golden

# re-pin the stale frames, but REFUSE any drop bigger than a re-narration should cause
gs repin scenes/episode-03.ts --golden test/golden --write --floor 0.98
```

## What it reports

For each frame it prints one of `identical` (PNG bytes match — the contract holds),
`new` (no committed golden yet), or `changed`. A changed frame carries:

- **a perceptual delta** — mean [SSIM](https://en.wikipedia.org/wiki/Structural_similarity)
  over 8×8 luma tiles, plus the single worst tile, so a one-pixel nudge and a
  wholesale reflow don't read the same;
- **a cause** — `gs repin` diffs the scene's `*.narration.timing.json` sibling
  against a git ref (default `HEAD`) and attributes the frame:

  ```
  f0090  ssim 0.9971 (min 0.812)  — seg-4 moved +0.21s: re-narration  → re-pinned
  ```

  A frame whose own beat didn't move but sits after one that did is attributed
  `downstream of seg-4 (+0.21s)`. No timing sibling (or not a git repo) → the
  cause column is simply omitted and you get the perceptual delta alone.

## Gated re-pinning

The default is a **dry run** — it reports and exits non-zero if anything is stale
(so CI notices un-repinned goldens), but writes nothing. Re-pinning is opt-in:

| flag | effect |
|---|---|
| `--write` | overwrite the changed / new goldens |
| `--only 60,90` | restrict writes to specific frames (confirm frame-by-frame) |
| `--floor <ssim>` | **refuse** to write any frame whose mean SSIM fell below this — a bigger drop than a re-narration should cause is a likely regression |
| `--force` | override the floor guard, once you've confirmed the drop is intended |
| `--heatmap <dir>` | write a per-frame thermal PNG (unchanged regions recede to the dark ground, divergence glows) for a visual second opinion |
| `--since <ref>` | diff the timing sibling against this git ref instead of `HEAD` |
| `--frames`, `--fps`, `--name` | the frame set, fps, and golden filename prefix (`<name>-f0090.png`) |

Byte-equality is still the acceptance test — SSIM only *explains* and *gates* a
divergence, never silently accepts one. A frame is re-pinned only when you asked
for it and it cleared the floor.

## The perceptual tier as a library

The SSIM machinery `gs repin` uses is exported from `@glissade/backend-skia` for
your own golden tooling:

```ts
import { ssim, ssimMap, heatmapRgba } from '@glissade/backend-skia';

const map = ssimMap(goldenRgba, renderedRgba, width, height);
map.mean;            // scalar SSIM (the PARITY-suite metric)
map.min;             // worst tile
map.minTile;         // { tx, ty } — its grid cell
heatmapRgba(map, w, h); // full-res thermal RGBA → putPixels() → encodePng()
```

These run on the headless Skia twin (never the browser embed path). Cross-path
byte-exactness remains the contract on the pinned toolchain; SSIM is the
perceptual lens for *review*, the same way browser↔Skia parity has always been
perceptual.

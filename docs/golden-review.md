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
  against a git ref (default `HEAD`) and attributes each changed frame. A
  re-narration re-records one line, so that segment's **duration** changes and
  every *later* segment's start is pushed by the same amount. Attribution names
  the edit site by its duration change and traces the pushed beats back to it:

  ```
  f0648  ssim 0.9400 (min -0.822)  — s2 re-narrated (+0.53s duration): re-narration  ◀ likely edit-site (lowest SSIM)
  f0954  ssim 0.9976  — downstream of s2 (+0.53s): re-narration
  f1176  ssim 0.9998  — downstream of s2 (+0.53s): re-narration
  ```

  Note the **edit site's own start doesn't move** — only its content (duration)
  does — so it's named by the duration delta, while the downstream beats cite the
  root that pushed them rather than their own derived shift. And because a content
  edit drops SSIM hard while a pure time-shift barely dents it, the lowest-SSIM
  changed frame is flagged `◀ likely edit-site` — the culprit-finder that works
  **even with no timing sibling** (or not a git repo), where the cause column is
  omitted and you get the perceptual delta alone.

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

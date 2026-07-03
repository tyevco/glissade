---
"@glissade/cli": minor
---

`gs render --incremental` — dirty-beat incremental render (re-render only the frames that changed)

An edit that shifts timing — move one beat, re-narrate, nudge a keyframe — changes **every downstream frame's** DisplayList, so it misses the whole-frame cache (every content key shifts) AND the audio-only remux fast path (the rolled-up digest flips). A 35-minute episode re-renders in full for a three-second change. `--incremental` kills that: it persists the **ordered per-frame content-key vector** in the render manifest, diffs it against the prior render, and re-renders **only the changed frame runs** — splicing the unchanged runs verbatim out of a retained FFV1 lossless intermediate.

```sh
gs render episode.ts --out ep.mp4 --incremental   # first run: builds the intermediate
# …edit one beat in the middle…
gs render episode.ts --out ep.mp4 --incremental   # re-renders only the changed run, splices the rest
#   incremental: 61/1530 frames changed — re-rendering those, splicing 1469 from the intermediate
```

**Determinism holds byte-exact THROUGH the optimization.** A warm splice is byte-for-byte identical to a cold `--incremental` render of the same edited scene: FFV1 is lossless and intra-only, so a kept segment decodes to the exact pixels a re-render would produce, and one final encode over the spliced stream is the cold render. The per-frame key is the same proof the frame cache and the golden corpus trust — an end-to-end test asserts splice ≡ cold-full byte-identity (forward edit, unchanged re-render, and reverse edit). Implies the lossless-intermediate pipeline; video output only; a duration change (frame-count mismatch), an encode-param change, or a GPU/shader scene falls back to a full render. The manifest gains an optional `frameKeys` field, so pre-0.41 manifests simply full-render the first time. Docs: `docs/caching.md`.

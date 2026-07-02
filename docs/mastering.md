# Series mastering (`gs master`)

`gs measure-loudness` (see [publishing loudness](/loudness) if present) normalizes
**one** asset at a time and **clamps** the gain against the measured source peak —
it ships no limiter. That's correct for a single clip, but across a *set* it has
two failure modes:

- a **peaky** short can't reach the loudness target without exceeding the peak
  ceiling, so it lands LUs low (a −14 series with −16 shorts), and
- there's no single shared target, so members drift apart.

`gs master` (0.39) fixes both. It measures every member **together**, picks the
loudest LUFS target the *whole set* can reach under a shared true-peak ceiling,
and ships a brickwall true-peak **limiter** so a peaky member recovers headroom
instead of landing low.

```jsonc
// glissade.master.json
{
  "profile": "youtube",                 // -14 LUFS / -1 dBTP (shorts/podcast/broadcast/ebu too)
  "members": ["episodes/**/e*.ts", "**/*-short.ts"],   // globs, like gs build's `scenes`
  "limiter": { "mode": "truepeak", "ceilingDb": -1.0 },
  "consistency": "shared-target"        // or "per-asset" (each hits its own max)
}
```

```sh
gs master glissade.master.json
#   shared target -14 LUFS, ceiling -1 dBTP
#   e01        in -22.1/-6.2dBTP -> +6.9dB,+1.2dB GR  out -14.0/-1.0
#   e07-short  in -11.8/-0.3     -> -2.2dB            out -14.0/-1.0
#   gs master: 16 members → shared target -14.0 LUFS / -1 dBTP (true-peak limiter), wrote <scene>.loudness.json ×16
```

## How the shared target is chosen

Each member can reach at most `inputLUFS + (ceiling − inputPeak) + limiterBudget`
(the raw peak headroom, plus what the limiter buys). The shared target is the
**quietest** of those maxima (capped at the profile target), so every member hits
it. A member the limiter still can't lift drags the shared target down — and is
reported, so you can see the constraint rather than silently under-shooting.

`limiter.maxGrDb` (default 6) bounds how much gain-reduction the limiter may apply.
`limiter: false` keeps the legacy peak-clamp (no limiter, a peaky member lands low)
— the old `measure-loudness` behavior, applied series-wide.

## Verify, then commit

For each member `gs master` applies the planned gain + limiter to the mix and
**re-measures the result**, so the reported `out` LUFS/dBTP is the real output, not
a prediction — and it exits non-zero if any member's verified true-peak still
exceeds the ceiling.

## It composes — a remux, not a re-render

`gs master` writes the ordinary `<scene>.loudness.json` sidecar (plus a `limiter`
block) with the same **mixHash** binding to the mix content. So:

- the render-time **stale-mixHash preflight** still guards it (a re-narrate
  invalidates the master loudly, before frame 1), and
- because the mix *content* didn't change, applying a master is a **mix-only remux
  (~20 s/asset)** — `gs render` copies the existing video stream and re-muxes the
  audio through the committed gain + limiter, never re-rendering frames.

The limiter is a **real true-peak** brickwall: it oversamples 4× so the `alimiter`
sees and holds the inter-sample peaks, then downsamples — a plain sample-peak
`alimiter` at a dBFS threshold would leave the true peak clipping over the ceiling.
It's the one non-linear stage, baked from the committed params in the audio filter
graph (deterministic on a pinned ffmpeg), so a mastered render is byte-identical
run-to-run. Visual determinism is untouched — this is an
audio-only pass.

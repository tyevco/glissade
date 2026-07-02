# @glissade/cli

`gs` — headless rendering and the dev/capture loop. `gs render` evaluates every frame, rasterizes on Skia (no browser anywhere), writes a PNG sequence or muxes mp4/webm via FFmpeg with sample-accurate audio. v2: `gs dev --record` serves a scene with its state machines mounted and writes input-trace sidecars; `gs render --trace/--state` are the deterministic export routes for interactive scenes.

The full command set: `render`, `dev`, `import` (Lottie `.json` / `.svg`), `build`, `mcp` (an MCP server over the engine), `describe`, `migrate`, `repin` (narration-aware golden reviewer), `narrate`, `sfx`, `prepare`, `measure-loudness`, `master` (series loudness + limiter), `fonts`, `cache`, `diff`, and `verify-determinism`. Run `gs` with no arguments for the full usage.

```sh
npm i -D @glissade/cli
```

```sh
gs render scene.ts --out out.mp4 --fps 60
gs dev scene.ts --record        # capture a take
gs render scene.ts --trace scene.button.take1.trace.json --out take.mp4
```

## Reviewing goldens (`gs repin`)

When a re-narration re-flows a project's beats, every downstream golden goes
stale at once. `gs repin` renders the current scene vs the committed golden PNGs
and, per changed frame, reports a perceptual SSIM delta (mean + worst tile) plus a
one-line **cause** — it diffs the `*.narration.timing.json` sibling against a git
ref to attribute the edit site and trace the pushed beats back to it. Default is a
dry run; `--write` re-pins, and `--floor <ssim>` refuses a bigger-than-expected
drop until `--force` — the confidence gate before you bless a batch re-pin.

```sh
gs repin scene.ts --golden test/golden                       # dry-run: what changed & why
gs repin scene.ts --golden test/golden --write --floor 0.98  # re-pin, guarded
```

The SSIM machinery is also exported from `@glissade/backend-skia`
(`ssim` / `ssimMap` / `heatmapRgba`) for your own golden tooling. Full guide:
[Reviewing goldens](https://github.com/tyevco/glissade/blob/main/docs/golden-review.md).

## Series loudness (`gs master`)

`gs measure-loudness` gains one asset at a time and clamps the gain against the
source peak — so a peaky short lands LUs below target and a whole series ends up
inconsistent. `gs master` measures a whole set together, picks the loudest shared
LUFS target the set can hit under a shared true-peak ceiling, and ships a brickwall
true-peak **limiter** so a peaky member recovers headroom instead of landing low.

```jsonc
// glissade.master.json
{ "profile": "youtube",
  "members": ["episodes/**/e*.ts", "**/*-short.ts"],
  "limiter": { "mode": "truepeak", "ceilingDb": -1.0 },
  "consistency": "shared-target" }
```

```sh
gs master glissade.master.json
#   e01        in -22.1/-6.2dBTP -> +6.9dB,+1.2dB GR  out -14.0/-1.0
#   e07-short  in -11.8/-0.3     -> -2.2dB            out -14.0/-1.0
#   shared target -14.0 LUFS — wrote <scene>.loudness.json ×16
```

It writes the same `<scene>.loudness.json` sidecar (plus a `limiter` block), so it
composes with the render-time mixHash preflight and **applies as a mix-only remux
(~20 s/asset), never a re-render**. Full guide:
[Series mastering](https://github.com/tyevco/glissade/blob/main/docs/mastering.md).

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

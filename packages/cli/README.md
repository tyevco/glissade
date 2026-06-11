# @glissade/cli

`gs` — headless rendering and the dev/capture loop. `gs render` evaluates every frame, rasterizes on Skia (no browser anywhere), writes a PNG sequence or muxes mp4/webm via FFmpeg with sample-accurate audio. v2: `gs dev --record` serves a scene with its state machines mounted and writes input-trace sidecars; `gs render --trace/--state` are the deterministic export routes for interactive scenes.

```sh
npm i -D @glissade/cli
```

```sh
gs render scene.ts --out out.mp4 --fps 60
gs dev scene.ts --record        # capture a take
gs render scene.ts --trace scene.button.take1.trace.json --out take.mp4
```

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

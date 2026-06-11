# Core concepts

One law underlies everything in glissade: **state is a function of time; time is never a side effect of state mutation.** Everything else falls out of it.

## The four layers

```
authoring   track()/key() raw data  +  the fluent builder (compiles to the document)
data        Track / Timeline — serializable keyframes; THE interchange format
values      Signal<T> — pull-based, lazy, cached, dependency-tracked
substrate   evaluate(scene, timeline, t) → DisplayList   (pure, total, any order)
```

## Signals

Node properties are signals: `circle.radius()` reads, `circle.radius.set(60)` writes, `computed(() => ...)` derives. They are lazy (compute on read), cached (memoized until a dependency changes), and dependency-tracked (edges register automatically). An equal-value recompute stops dirtiness propagating — scrubbing through a region where only two of fifty nodes animate re-renders two nodes.

During evaluation a **phase guard** makes writes throw: rendering is a pure read phase. Signals must be time-indexed only — no "value I had last frame". Stateful behavior belongs in `bake()`.

## Tracks and the Timeline document

A `Track` is keyframes targeting one property path (`'circle/position.x'`). Easing lives on the *arriving* key; value types (number, vec2, OKLab color, …) supply interpolation; `interp: 'hold'` steps. The `Timeline` document holds tracks, labels, markers, audio clips, asset refs, and nested children (`add` = flattened, `sync` = opaque with its own clock). It is plain JSON — what the builder emits, the studio edits, git diffs, and the runtime evaluates.

## evaluate(scene, timeline, t)

Pure, total, deterministic: same inputs → same DisplayList, in any call order. The playhead write at entry is the one sanctioned mutation; everything after is pull-only. This single contract buys:

- **scrubbing** — the scrub bar is `evaluate` in a loop;
- **parallel export** — frame N needs zero history, so render farms shard by frame range;
- **testing** — golden-frame PNGs byte-compare in CI on a pinned toolchain.

Assets are warmed *before* evaluation (`evaluate` never awaits); a cold video source throws a structured `ColdAssetError` that drivers catch to warm-and-retry.

## The DisplayList and backends

Nodes never touch a rendering context. `evaluate` emits a flat, serializable command stream (`fillPath`, `fillText`, `pushGroup`/`popGroup` for group opacity and blends, `drawImage` against an asset registry). Backends rasterize it: Canvas 2D in the browser, Skia (`@napi-rs/canvas`) headless — both Skia-family rasterizers, so preview and export agree (byte-exact per path; perceptual SSIM across the seam).

## Drivers and the Player

The playhead is a writable signal; **anything** may write it. The Player's rAF clock is just the default Driver — scroll is another, and v2 state machines will be a third. Playback is time-based, never frame-counted: a dropped frame skips ahead without drift, because evaluating at the skipped-to time is identical to having rendered every intermediate frame.

## Determinism boundaries, stated honestly

- Byte-exact: same path (browser *or* CLI), pinned toolchain — including across machines (CI-verified).
- Perceptual (SSIM-gated): across the browser↔Skia seam.
- Near-parity: decoded pixels of embedded video (WebCodecs vs FFmpeg decoders differ by ±1 LSB).
- Out of scope: future GPU shader effects (explicitly outside the guarantee).

---
'@glissade/core': minor
---

Add **motion clips** — build-time authoring sugar, on the tree-shakeable `@glissade/core/clips` sub-path. A `clip()` captures a relative-time key schedule over named prop *channels*; `clip.apply(target, startSec, opts?)` compiles it to ordinary keyed `Track[]` at apply-time (exactly like `springTo`/`stagger`) — **byte-indistinguishable** from hand-authored `track()`, never a runtime concept, never in the serialized Timeline document. Every channel compiles through `track(target, type, keys)`, so `validateTrack` runs and the `evaluate()` purity contract is untouched.

`target` is a node-id string (each channel → `'<nodeId>/<channel.path>'`) **or** a `{ channel: TweenTarget }` map for per-channel path override. `opts.overrides` substitutes a channel's value/ease topology-preservingly (no add/remove keys); `opts.speed` divides every relative `t`. `clipList(clip, targets, startSec, { stagger })` fans a clip across a list, reusing the `stagger` shape. A small stdlib of `clip(...)` literals ships from the same sub-path: `popIn`, `slideIn`, `pulse`, `driftLoop` (the last two are seamless loop clips).

New exports from `@glissade/core/clips`: `clip`, `clipList`, `ClipError`, `popIn`, `slideIn`, `pulse`, `driftLoop`, and the `Clip` / `ClipSpec` / `ClipChannel` / `ChannelOverride` / `ApplyOpts` / `ClipResult` / `ClipTarget` / `ClipListOpts` / `DurationOpts` / `SlideEdge` types.

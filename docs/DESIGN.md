# glissade (glide & slide) — Architecture & Design

**Status:** Draft — open questions resolved with the author 2026-06-11 (§8)
**Date:** 2026-06-10
**License:** Apache-2.0

**Executive summary.**
glissade (long-form "glide & slide") is an Apache-2.0, TypeScript-first framework for programmatic motion graphics: realtime-first in any web page, with deterministic headless export as a second consumer of the same substrate. The entire system rests on one contract — `evaluate(scene, timeline, t)` is pure — so the same scene scrubs at 60fps in a `<canvas>`, renders frame-exact in CI, and opens in a visual studio. Animations are data: node properties are pull-based signals; animations are serializable keyframe `Track`s inside a versioned `Timeline` document; a fluent GSAP-style builder compiles to that document rather than executing at play time. There are no generator coroutines and no promise-chained sequencing — promises appear only as completion notifications. Rendering is split through a flat `DisplayList` IR consumed by pluggable backends: `Canvas2DBackend` (browser) and `SkiaBackend` (`@napi-rs/canvas`, headless CLI) ship in v1; a WebGPU effect layer is architecturally reserved. Determinism is enforced (runtime guards, lint, golden-frame CI), and honestly scoped: byte-exact per path on a pinned toolchain, perceptual (SSIM) parity across the browser/Skia seam. Stateful simulation enters only via `bake()`, which compiles physics into ordinary tracks. The studio is a same-license React app over the open core, persisting edits to a sidecar document merged at track granularity. Target users, in order: realtime web-animation embedders, the orphaned Motion Canvas community, Remotion license refugees, and manim refugees. Package scope is `@glissade/*` (decided; npm org creation is the remaining verification step); CLI binary `gs`; custom element `<gs-player>`; repo `tyevco/glissade`.

## Table of contents

1. [Vision, Goals, and Positioning](#1-vision-goals-and-positioning)
2. [Core Model: Signals, Tracks, Timeline, Evaluation](#2-core-model-signals-tracks-timeline-evaluation)
3. [Scene Graph and Renderer Abstraction](#3-scene-graph-and-renderer-abstraction)
4. [Runtime, Playback, and Embedding](#4-runtime-playback-and-embedding)
5. [Export Pipeline and Determinism](#5-export-pipeline-and-determinism)
6. [Editor (Studio)](#6-editor-studio)
7. [Packages, Repo, Tooling, and Roadmap](#7-packages-repo-tooling-and-roadmap)
8. [Decision Record](#8-decision-record)

---

## 1. Vision, Goals, and Positioning

### 1.1 Pitch

**glissade** ("glide & slide") is an Apache-2.0, TypeScript-first framework for programmatic motion graphics that runs in real time in any web page and also exports deterministic video headlessly. Animations are authored as **signals + keyframe tracks**: node properties are reactive signals, animations are serializable `Track`s bound to them, and a fluent GSAP-style builder compiles to that document. The entire system is built on one contract — `evaluate(scene, timeline, t)` is pure — so one scene scrubs at 60fps in a `<canvas>`, opens in a visual studio, and renders frame-exact in CI on Skia: it runs in any web page first, and everything else falls out of the same substrate.

### 1.2 Target users

1. **Realtime web-animation embedders.** Teams who today reach for GSAP or Lottie for in-page motion but want a scene graph, a timeline document, scrubbing, and an eventual editor — with video export as a bonus rather than the product. Realtime-first is *our* differentiator against every export-first incumbent; this segment leads the positioning.
2. **Motion Canvas's orphaned community.** ~18.6k stars and a ~2,800-member Discord with no maintained home: last meaningful commits Dec 2024/Feb 2025, motioncanvas.io NXDOMAIN, "Is the repo dead?" (#1221) unanswered, the Canvas Commons fork still nascent. What these users asked for — library-first architecture, a programmatic render API, audio export, editor decoupling — is our core design. Migration pitch: same loved ergonomics (signals, write-steps-in-order composition, live preview) minus the generator runtime that locked the project to a bespoke interpreter.
3. **Remotion license refugees.** Remotion's source-available license (free only for ≤3-person companies; $100/mo+ minimums; derivatives prohibited) is the ecosystem's loudest complaint. Both MIT challengers fizzled: Motion Canvas went dormant; Revideo's team pivoted to commercial Midrender. We are clean-room with respect to Remotion — concepts (video as a pure function of time), never code (see §7.4 for the operational policy).
4. **manim refugees.** The documented manim → Motion Canvas migration path (live preview, TS ergonomics, no LaTeX/ffmpeg setup hell) is now a dead end. We are its maintained continuation.

### 1.3 Goals (v1)

- **Realtime-first**: embeddable player (`play/pause/seek/loop`) driving a `Playhead`; 60fps scrubbing on commodity hardware; scroll-linked playback via the Driver seam (§4.1).
- **Deterministic export, secondary but fully shipped in v1**: headless Skia rendering (`@napi-rs/canvas`) with per-path determinism and browser↔Skia perceptual parity (§5.5–§5.6); in-browser WebCodecs export (§5.1); the determinism contract (§5.5) enforced from day one — CI can snapshot frame 120.
- **No generators, no promise-chaining substrate**: sequencing lives in data (the `Timeline` document), not in suspended coroutines. Promises appear only as completion notifications.
- **One animation interchange format**: the serializable `Timeline` carries tracks, labels, markers, audio clips, and assets; scene *structure* lives in code (§6.2). The builder compiles to the document; the studio edits it; `evaluate()` consumes it.
- **Renderer-agnostic core**: `evaluate()` produces a `DisplayList`; `Canvas2DBackend` and `SkiaBackend` ship in v1; `WebGPUBackend` is architecturally reserved (§3.7).
- **Stateful simulation without breaking purity**: `bake()` turns physics/particles into frame-indexed `Track`s via fixed-dt seeded pre-simulation (§2.8).
- **Editor-ready**: signals bridge to React via `useSyncExternalStore`; the studio is a consumer of the open core, not a privileged layer.

### 1.4 Non-goals (v1)

- **3D.** 2D scene graph only; no Three.js integration.
- **NLE / clip assembly.** Not an Editly-style cut-and-splice timeline; this is an animation language.
- **Interactivity beyond linear and driver-linked playback.** Event-driven transitions and Rive-style state machines are **v2**; v1's signal layer is designed so they land without a rewrite (§2.9, §4.7). The scroll Driver *does* ship in v1 (§4.1) — it is a time source, not a state machine.
- **WebGL/WebGPU as the base renderer.** Deferred to v1.x/v2 as an effect layer; rejected as the base per research: text rendering cost and GPU nondeterminism break parity.
- **DOM/SVG rendering backend; Lottie import** (interop is roadmap, not v1).

WebCodecs browser export is **v1 scope (M3)**, not a non-goal: the PNG-sequence fallback is unconditional, the MP4/WebM paths are gated only on `isConfigSupported()`, and the contingency if M3 slips is reordering, never cutting it from v1 (§5.2, §7.5).

### 1.5 Ecosystem positioning

| | **glissade** | Motion Canvas | Remotion | Theatre.js | GSAP | Rive |
|---|---|---|---|---|---|---|
| **License** | Apache-2.0 | MIT | Source-available; paid for companies >3 people | core Apache-2.0, studio **AGPL-3.0** | Free incl. commercial (Webflow, since Apr 2025) | Proprietary editor; open-source runtimes |
| **Time model** | Pure `evaluate(scene, timeline, t)`; signals + keyframe tracks; builder compiles to document | Generator coroutines (seek = re-run from 0) | React render per frame (pure function of frame) | Keyframe sequence document + playhead | Imperative tweens/timelines, runtime-built | Editor-authored state machines |
| **Export** | Headless Skia (CI-grade, per-path deterministic); in-browser WebCodecs | Editor button only; no headless API, no audio | Headless Chromium screenshots (~1–2 fps), Lambda complexity | None | None (paired with Remotion) | .riv runtime files, not video |
| **Editor** | Planned React studio over open core (same license) | Bundled, inseparable | None (code only) | Yes, but AGPL + repo went private | None | Yes (the product, closed) |
| **Maintenance (mid-2026)** | New | Dormant; site NXDOMAIN | Very active (commercial) | Stale public repo; "moved to private repo" | Active under Webflow | Active (commercial) |

**Rive positioning (decided):** v1 does not market against Rive; we claim state-machine interactivity only when it ships in v2 — claiming it at launch would undercut both the realtime-first headline and credibility. The table row reflects general knowledge and **must be fact-checked against Rive's current licensing before publication** (§8, item 6).

### 1.6 The four demand-verified gaps this fills

1. **A framework-agnostic realtime core with an optional, non-AGPL visual editor** — Theatre.js's core/studio wedge, minus the AGPL studio and the private-repo stagnation; thin React/Vue/Svelte/vanilla bindings over one evaluator.
2. **A maintained successor for the orphaned Motion Canvas community**, delivering exactly what they requested: library-first, programmatic rendering, audio, editor decoupling.
3. **A permissively-licensed realtime framework whose export path replaces Remotion** — genuinely vacant after Motion Canvas's dormancy and Revideo's commercial pivot.
4. **Fast deterministic export without headless Chromium** — direct Skia rasterization plus browser-side WebCodecs ("faster-than-realtime, no server" — an explicit Revideo user ask) on the same `DisplayList`.

> **Note on license deviation from research:** the ecosystem research recommends MIT; the locked project decision is **Apache-2.0** — the explicit patent grant matters for a rendering engine likely to be embedded commercially, and it matches the precedent users already accept for Theatre.js core.

---

## 2. Core Model: Signals, Tracks, Timeline, Evaluation

The four-layer core stack. The layers compose; they do not compete:

```
values      Signal<T>        — pull-based reactive values; node props are signals
data        Track / Timeline — serializable keyframe document; THE animation interchange format
substrate   evaluate(scene, timeline, t) → DisplayList   — pure, total, cheap at any t
authoring   track()/key() raw data  +  fluent builder compiling to Tracks
```

The single law underneath everything (every surveyed system — GSAP, Theatre, WAAPI, Remotion, anime v4 — converges on it): **state is a function of time; time is never a side effect of state mutation.** Generators and promises both consume time — the schedule exists only as a suspended program counter, so backward seek means replay (Motion Canvas documents O(t) backward-scrub lag) or is impossible outright (a settled promise cannot unsettle, and a promise chain cannot even report its duration to draw a scrubber). Promises appear in this design exactly once: as `.finished` completion notifications on a seekable core — the role they play in GSAP, anime, Theatre, and WAAPI alike.

### 2.1 Signal<T>: the value layer

**Decision:** Motion Canvas-style pull-based signals — **lazy** (computed only when read), **cached** (memoized until a dependency invalidates), **dependency-tracked** (reads inside a computation auto-register edges; a write marks dependents dirty but defers recomputation to the next read). Motion Canvas uses exactly this machinery to cache transform matrices, layout, and subtree raster caches; we inherit that proof.

```ts
const radius = signal(50);                       // Signal<number>
radius();                                        // read (tracked)
radius.peek();                                   // read without dependency registration
radius.set(60);                                  // write (authoring/driver-time only)
radius.subscribe(cb);                            // invalidation notifications (editor bridge)
const area = computed(() => Math.PI * radius() ** 2);  // deps auto-tracked

// Compound signals: sub-signals are real signals; tracks may target either level (§2.2)
const position = vec2Signal({ x: 0, y: 0 });
position();        // Vec2
position.x();      // number — independently trackable/derivable
```

Deviation from Motion Canvas, flagged: MC overloads call arity (`sig(v)` sets, `sig(v, dur)` tweens). With no generator tweens, the third arity is gone, and we split read/write into `sig()` / `sig.set(v)` — explicit, greppable, and it keeps "accidentally invoked a setter" out of computed bodies. `subscribe` + synchronous `peek` are exactly the shape `useSyncExternalStore` needs (§4.3).

Every node property is a signal; cross-node derivation is just a computed initializer: `Rect({ width: () => circle.radius() * 2 })`.

**The purity rule:** signals are **time-indexed only — no cross-frame accumulation**. A computed signal must be a pure function of its dependencies; it may depend on the playhead, never on "the value I had last frame." Stateful reactive nodes (Framer Motion's velocity-aware `MotionValue`) are the signal-world equivalent of consumed promise chains: they break random access for that node and everything downstream. Enforcement, in layers:

1. **Phase guard (runtime, always on):** evaluation is a read phase. Any `signal.set()` while `evaluate()` is on the stack throws, with exactly two sanctioned mutations: (a) the playhead write at `evaluate()` entry, performed by the evaluation driver before the read phase begins; (b) semantics-invisible memoization (per-track segment cursors §2.4, backend bitmap caches §3.5), validated by the dev harness re-running cache-cold.
2. **API omission:** there is no `previousValue`, no `onFrame(state => state)` hook, no integrator in the core. Stateful needs route through `bake()` (§2.8).
3. **Determinism lint + dev harness:** an ESLint plugin bans `Date.now`/`performance.now`/`Math.random`/`setTimeout` in scene modules (Remotion enforces the same contract; Replit's post-hoc clock-patching retrofit ran ~1,200 lines — we make it day one). Dev mode periodically re-evaluates a random already-seen frame **cache-cold** and hash-compares the DisplayList; a mismatch names the offending node. This catches the closure-captured-mutable-variable cases lint can't see.

### 2.2 Tracks and keyframes

A **Track** is the atom of animation: a serializable keyframe list targeting one property path.

```ts
interface Key<T> {
  t: number;            // seconds, local to owning timeline
  value: T;
  ease?: Ease;          // shape of the segment ARRIVING at this key (from the previous key)
  interp?: 'default' | 'hold';   // 'hold' = step: previous value until this t
  id?: string;          // stable key id (studio-assigned, e.g. 'k1'); optional in code-authored docs
  derived?: boolean;    // true = builder-resolved implicit from-value; re-resolved on merge (§2.6, §6.2)
}

type Ease =
  | string                                   // registry name: 'easeInOutCubic', 'linear', …
  | { kind: 'cubicBezier'; pts: [number, number, number, number] }
  | { kind: 'spring'; stiffness: number; damping: number; mass: number };  // §2.7

interface Track<T = unknown> {
  target: string;        // canonical path: '<nodeId>/<prop.path>' — 'circle/position.x', 'title/opacity'
  type: ValueTypeId;     // 'number' | 'vec2' | 'color' | 'path' | registered custom
  keys: Key<T>[];        // sorted by t; invariant enforced at insert
  editable?: boolean;    // studio may own this track's keys via sidecar (§6.2)
}
```

**Decisions and rejections:**

- **Target addressing (decided; closes the former open question).** Targets are **stable-ID-rooted paths**: explicit node `id` (build-error on duplicates, §6.5), then a dot-path into the prop tree, joined by `/` — `title/opacity`, `circle/position.x`. A compile-time validation pass errors on unbound tracks; structural fallback IDs (`~Group.2/Rect.0`) exist for inspection only, never as track targets. This is the same scheme the editor merge story keys on (§6.5) — one grammar everywhere.
- **One track per target per Timeline (decided).** The compiler **coalesces** same-target tracks into a single track before the document is final: overlapping segments resolve last-insertion-wins with a dev warning (`additive: true` is a reserved schema extension for v2 blending). A compound target (`circle/position`) and a sub-signal target (`circle/position.x`) may coexist; the sub-signal track takes precedence for its component. This makes the editor's canonical track IDs (§6.5) true by construction.
- **Ease lives on the incoming key** (Theatre/Lottie convention) rather than as a separate segment list — one array, no parallel-structure drift. Rejected: per-track single ease (GSAP tween-level) — too coarse for editor curve editing.
- **Pluggable per-type interpolation.** Sampling a segment is `ValueTypes[type].lerp(a, b, easedT)`. The registry ships `number`, `vec2` (with `arcLerp` variant), `color` (OKLab by default; naive sRGB lerp rejected — gray dead zones), `path` (normalized-command interpolation, Flubber-style fallback for mismatched topology), and `paint` (gradient morph: a solid color lifts to a uniform gradient to meet a matched-kind/stop-count gradient and lerps stops + geometry; mismatched shapes snap with a dev warning. A `mesh` Paint — N color points blended across the [0,1]² fill rectangle as one animatable fill, the native replacement for an "N blurred blobs" aurora — lerps matched-count meshes pairwise (point `pos` + OKLab `color`, `interpolation`/`bg` carried), and snaps on a mismatched point count or cross-kind, §3 Paint). Each entry declares `extrapolates: boolean`: types whose lerp is linear (`number`, `vec2`, `color` in OKLab) accept `easedT` outside [0,1] (springs overshoot, §2.7); `path`, `paint`, and discrete types clamp. Custom value types register `{ lerp, extrapolates, serialize, deserialize }`. Rejected: numbers-only tracks with adapter layers (Lottie) — pushes color/path semantics into every consumer.
- **Hold keys** (`interp: 'hold'`) give discrete steps — sprite flipbooks, text swaps, booleans. Discrete-typed tracks (`string`, `boolean`) are hold-only by construction.

### 2.3 The Timeline document

The Timeline is the serializable animation source of truth — what the builder compiles to, what the editor edits (via the sidecar overlay, §6.2), what the runtime evaluates, what gets diffed in git. It does **not** contain scene structure; nodes live in code (§6.2), which is why no-code embedding requires a compiled scene bundle (§4.3).

```ts
interface Timeline {
  version: 1;
  duration?: number;             // optional override; default = computed (below)
  fps?: number;                  // advisory for export/snapping; evaluation is continuous-time
  posterTime?: number;           // reduced-motion / poster frame (§4.2); default = duration
  tracks: Track[];
  labels: Record<string, number>;          // name → t
  markers?: { t: number; name: string; data?: Json }[];  // events/cues, no values; fired by the Player only (§4.2)
  children?: ChildEntry[];                 // nesting
  audio?: AudioClip[];                     // audio-as-metadata (§5.3)
  assets?: Record<string, AssetRef>;       // by id, see AssetRef
}

interface AssetRef {
  kind: 'font' | 'image' | 'audio' | 'video' | 'timeline';
  url: string;            // or content hash in compiled bundles
}

interface ChildEntry {
  timeline: Timeline | { ref: string };    // inline, or AssetRef of kind 'timeline'
  at: number;                              // offset on parent axis, resolved at compile time
  mode: 'add' | 'sync';                    // anime v4 distinction, see below
  timeScale?: number;                      // sync-mode only
}
```

JSON example (the §2.6 demo animation):

```json
{ "version": 1,
  "tracks": [
    { "target": "circle/opacity", "type": "number",
      "keys": [ { "t": 0, "value": 0 },
                { "t": 1, "value": 1, "ease": "easeInOutCubic" },
                { "t": 2, "value": 1, "interp": "hold" },
                { "t": 2.5, "value": 0, "ease": "easeOutQuad" } ] },
    { "target": "circle/position.x", "type": "number",
      "keys": [ { "t": 1, "value": 0 }, { "t": 2, "value": 300, "ease": "easeInOutCubic" } ] },
    { "target": "circle/scale", "type": "vec2",
      "keys": [ { "t": 1, "value": [1,1] }, { "t": 2, "value": [2,2], "ease": "easeInOutCubic" } ] }
  ],
  "labels": { "settled": 2 } }
```

**Nesting — `add` vs `sync`** (deliberately imported from anime v4): `add` children are **flattened at compile time** — their tracks are re-based by `at`, merged into the parent's track space, and coalesced per the one-track-per-target rule. `sync` children stay **opaque**: an embedded black-box timeline with its own local clock, scrubbed by mapping parent t through `at`/`timeScale`. Use `add` for composition you want the editor to open flat; use `sync` for reusable pre-authored components and time-warping (slow-mo a sub-scene without touching its keys).

**Duration** = `max(explicit override, max key t across tracks, max(child.at + child.duration / timeScale))`. Computed by default — durations are statically known, so the scrubber is free (the decisive advantage of timeline-as-data over both generators and promises, where total duration is unknowable without execution).

### 2.4 Playhead and seeking

The **Playhead** is a writable time signal. Players, the export loop, the scrub bar, and drivers (§4.1) all do exactly one thing: write it. Theatre's `sequence.position = 1.25` is the model — and the reason its scrubbing, audio-sync, and scroll-linking are all the same code path.

Animated properties are not "written each frame." Binding a Timeline to a scene rewires each targeted property signal's source to a computed: `() => sampleTrack(track, playhead())`. Evaluation is therefore pull-only — the §2.1 phase guard holds.

Seek cost: `sampleTrack` binary-searches the key array — **O(log k) per track** — and each track keeps a last-segment cursor (sanctioned memoization, §2.1), so monotonic playback is O(1) amortized. Invalidation is fine-grained: a playhead write dirties only playhead-dependent computeds; static props, independent layout, and cached subtree rasters are untouched. A further cheap win: if the sampled value equals the cached value (inside a hold segment, or past the last key), the signal does not propagate dirtiness — scrubbing through a region where only two of fifty nodes animate re-renders two nodes.

Reverse and random-access seeks are free *by construction* — nothing is consumed, the structure is data. Contrast the two rejected models: generators (reset + replay to t — the documented Motion Canvas scrub lag) and promises (no mapping t → state exists at all).

### 2.5 evaluate(scene, timeline, t): the non-negotiable contract

```ts
function evaluate(scene: Scene, timeline: Timeline, t: number): DisplayList;
```

This is the one canonical signature; prose shorthand "`evaluate(…, t)`" always means it. Pure, total, deterministic: same `(scene, timeline, t, seed, assets)` → bit-identical DisplayList **on the same JS engine with pinned dependency versions, in any call order**. (ECMAScript does not pin transcendental `Math` precision; V8/JSC/SpiderMonkey differ by ULPs in `exp`/`sin`/`pow`, which springs and easings use — so cross-engine output is near-identical, not hash-identical. Shipping fdlibm-style deterministic math is the escape hatch if cross-engine hashing is ever required; see §8 item 5.) Concretely evaluate is: driver writes `playhead = t` (the sanctioned entry write) → pull the scene graph's root → collect draw commands. **Readiness precondition:** all referenced assets are decoded and, for `Video`, the `VideoFrameSource` is warmed for t (§3.8) — callers await readiness before evaluating; `evaluate()` itself never awaits or blocks.

The contract is load-bearing for three product pillars, which is why it cannot be relaxed "just for this one node":

1. **Export parallelism.** Frame N renders with zero history, so the headless Skia path shards frame ranges across workers/machines trivially (Remotion's render farm rests on the same property). One impure node serializes the entire export.
2. **Scrubbing.** The editor's scrub bar is `evaluate` in a loop — no replay, no per-frame warm-up beyond the stated resource-readiness precondition.
3. **Testing.** `expect(evaluate(scene, tl, 2.0)).toMatchSnapshot()` — golden-frame tests in CI with no browser, and bisectable diffs when a frame changes.

The full normative determinism contract lives in §5.5; everything else in this document references it.

### 2.6 Two authoring surfaces, one document

Both surfaces produce Tracks; the builder is sugar, not a second engine. The demo: fade in a circle (1s), then move right while scaling (1s, parallel), then fade out (0.5s).

**Raw data — `track()`/`key()`:**

```ts
const tl = timeline({
  tracks: [
    track('circle/opacity', 'number', [
      key(0, 0), key(1, 1, 'easeInOutCubic'), key(2, 1, { interp: 'hold' }), key(2.5, 0, 'easeOutQuad'),
    ]),
    track('circle/position.x', 'number', [key(1, 0), key(2, 300, 'easeInOutCubic')]),
    track('circle/scale', 'vec2', [key(1, [1, 1]), key(2, [2, 2], 'easeInOutCubic')]),
  ],
  labels: { settled: 2 },
});
```

**Fluent builder — GSAP-grammar position parameters, compiling to the identical document:**

```ts
const tl = timeline(tl => {
  tl.to(circle.opacity, 1, { duration: 1, ease: 'easeInOutCubic' })
    .to(circle.position.x, 300, { duration: 1 })            // default: after previous end
    .to(circle.scale, [2, 2], { duration: 1, at: '<' })     // '<' = previous START → parallel
    .label('settled')
    .to(circle.opacity, 0, { duration: 0.5, ease: 'easeOutQuad', at: 'settled' });
});
```

Position grammar (proven across GSAP/anime/Motion One): absolute `1.5`; relative `'+=0.5'` / `'-=0.2'` (from previous end); `'<'` / `'>'` (previous start / end); `'label'` and `'label+=0.3'`. Plus `.set(target, value, { at })` (hold key); `.fromTo(target, a, b, opts)`; `.add(child, position, { mode: 'add' | 'sync' })`; `.call(fn, at)` — compiles to a marker whose callback is registered on the Player, never serialized, never invoked by `evaluate()` (firing semantics in §4.2); `.editable()` — marks the preceding track `editable: true` for the studio (§6.2); and scene-level `editableDuration()` opting the timeline's duration into studio editing. Build-time control flow is plain TypeScript — `if (opts.outro) tl.add(outro(circle), '+=0.2')`, loops, `.map` — which covers most of what made generators tempting, without coroutines. Nothing executes at play time; `seek` is pure evaluation of the compiled document.

**Builder design fix over GSAP — explicit or document-derived from-values, never live sampling.** GSAP samples from-values from the live DOM at first render — the root of its `invalidate()`/`refresh()` bug class (stale captures, seek-before-first-play). Here, implicit from-values are resolved in a **finalize pass after all insertions, in t-order against the complete document** (not insertion order — resolving per-insertion would just move GSAP's stale-capture bug to build time, since a later `.to(..., { at: 0 })` can precede an earlier insertion in time). Each resolved from-value serializes as a leading key marked `derived: true`; on document load, `derived` keys are **re-resolved against the merged document** (code baseline + sidecar, §6.2), so studio edits upstream of a code tween propagate without pops. Need runtime-dependent starts? `fromTo` exists, and dynamic *structure* means rebuilding the timeline — same rule as GSAP/anime, but honest about it.

**Overlapping tracks (decided):** later insertion wins during overlap, with a dev warning; the compiler coalesces to one track per target (§2.2); `additive: true` is reserved in the schema for v2 blending. This is the locked linear-v1 / schema-reservation pattern.

**Motion clips — build-time sugar (a third surface, same document).** `clip()` captures a relative-time key schedule over named prop *channels*; `clip.apply(target, startSec, opts?)` compiles to ordinary keyed `Track[]` **at apply-time** — authoring sugar exactly like `springTo`/`stagger` (§2.6), **not** a runtime concept and **not** part of the serialized Timeline document. A clip is a reusable, target-agnostic motion (an "entrance", a "pulse"); applying it binds the channels to a node and offsets the schedule onto the wall clock. Emitted tracks are **byte-indistinguishable** from hand-authored `track(...)`: every channel compiles through `track(target, type, keys)`, so `validateTrack` runs and the determinism contract (§2.5) is untouched. A node-id *string* resolves every channel to `'<nodeId>/<channel.path>'`; a `{ channel: TweenTarget }` *map* overrides per channel (so the string form is a strict superset). `opts.overrides` substitutes a channel's value/ease **topology-preservingly** (no add/remove keys); `opts.speed` divides every relative `t`. `clipList(clip, targets, startSec, { stagger })` fans a clip across a list, reusing the `stagger` shape. Clips and their stdlib (`popIn`/`slideIn`/`pulse`/`driftLoop`) ship from the tree-shakeable `@glissade/core/clips` sub-path, off the base embed budget. The channel-spec + `apply` signature locked here is the binding shape the later presence/each/morph cards inherit.

### 2.7 Springs: closed-form, never integrated

A spring is a pure closed-form function of local time — the same concept Remotion validated, implemented independently from the standard damped-harmonic-oscillator solution. A spring is an `Ease` variant (§2.2): the segment from key A to key B is shaped by the closed-form solution evaluated at `tLocal`. No integrator, no per-frame state, fully serializable, seek-safe.

```ts
const cfg = { stiffness: 170, damping: 26, mass: 1 };
tl.to(circle.position.x, 300, { ease: spring(cfg) });            // duration inferred ↓
spring.duration(cfg, { settleTolerance: 0.005 });                // → e.g. 1.18s, closed-form
spring.value(cfg, tLocal);                                       // progress, pure; may exceed 1 (overshoot)
```

Three semantics pinned down:

- **Overshoot:** `easedT` exceeds [0,1]; value types handle it per their `extrapolates` flag (§2.2). Springs on non-extrapolating types (path, discrete) clamp, with a dev warning.
- **Endpoint continuity:** the raw closed form never reaches exactly 1; to avoid a snap at the key (≈0.5% — visibly ~1.5px on a scaled 300px move), the curve is **affinely rescaled so `value(duration) = 1` exactly**. Documented as part of the spring's defined output.
- **Raw-format constraint:** a spring ease determines its key's `t`. Rule: a spring-eased key must satisfy `key.t = prevKey.t + spring.duration(cfg)`; the builder computes this automatically; document validation errors on mismatch.

`spring.duration()` answers the question that breaks frame-pure systems' ergonomics ("play until it settles" — Remotion users must precompute this manually): the builder calls it to place the *next* item, so `'>'` after a spring just works. Rejected: Motion Canvas's integrator spring and any velocity-carrying spring (Framer Motion) — cross-frame state, breaks §2.5. Velocity-preserving *interruption* is a v2 concern, handled by re-targeting: emit a new closed-form segment whose initial velocity is computed analytically from the old one at switch time — still pure per segment.

### 2.8 bake(): stateful simulation as a compilation step

Physics, particles, and accumulators are the one thing pure `f(t)` cannot express — and the gap none of the incumbents fill first-class (Remotion's maintainer-endorsed answer is manual baking, discussion #4373; issue #7803 requests built-in support). We ship it as a primitive: run the stepper **once**, fixed dt, seeded RNG; output is ordinary frame-indexed Tracks; render is pure lookup. Statefulness becomes a *compile-time* problem and §2.5 survives untouched.

```ts
const baked: Track[] = bake({
  duration: 15, fps: 60, seed: 42,                 // dt = 1/fps, fixed — never wall clock
  setup: (rng) => createWorld(rng),                // seeded RNG injected, Math.random banned
  step: (world, dt) => physicsStep(world, dt),
  sample: (world) => ({                            // → one key per frame per path
    'ball/position': world.ball.pos,               // vec2 track
    'ball/rotation': world.ball.angle,
  }),
});
tl.add(timeline({ tracks: baked }), 'drop');       // composes like any sub-timeline
```

Baked tracks serialize into the Timeline like hand-authored ones — scrubbable, diffable, shared by all parallel export workers (bake once, render anywhere). For memory-prohibitive cases (10⁵ particles × 60s), the **checkpointing variant** trades memory for bounded re-simulation: snapshot full world state every K frames; warming time t = restore nearest checkpoint ≤ t, re-step ≤ K times.

```ts
const sim = bake.checkpointed({ every: 120, snapshot: w => structuredClone(w), restore: s => s, ... });
```

Checkpointed bake is a **pre-pass outside `evaluate()`**: the player/exporter warms the needed track range before evaluation begins, so `evaluate()` never blocks on re-stepping. Output is bit-deterministic (fixed dt + seed, per pinned engine — §2.5); **only the memory/latency profile differs from fully-baked mode.** Export sharding consequence (§5.6): each shard either re-simulates its prefix from frame 0 or receives serialized checkpoints with its range assignment.

### 2.9 Interactivity later, without a rewrite

The v2 path falls directly out of the layering: **time is just one input signal.** Property signals don't know the playhead is special — they pull from whatever source they're bound to. The clock and scroll Drivers already ship in v1 (§4.1). v2 adds (a) further non-time drivers — pointer, audio amplitude — as writable input signals feeding the same computed graph (the signal model is the only surveyed model that unifies timeline-driven and interaction-driven values); and (b) **transition graphs / state machines** (Rive-style) whose states bind sub-timelines and whose transitions retarget the *sources* of property signals — including velocity-matched spring re-targeting per §2.7. Events fire transitions; transitions swap bindings; evaluation stays pure per frame. Nothing in the Track/Timeline/evaluate substrate changes — which is precisely why the v1 rule "no cross-frame state in signals" must hold now: it keeps the v2 door open.

---

## 3. Scene Graph and Renderer Abstraction

The core invariant: **nodes never touch a rendering context.** `evaluate(scene, timeline, t)` resolves the scene graph's signals at `t` and emits a **DisplayList** — a flat, serializable draw-command IR — which a pluggable **RenderBackend** rasterizes.

### 3.1 Node taxonomy and signal-typed props

**Decision:** a small, closed set of built-in nodes — `Group`, `Rect`, `Circle`, `Path`, `Text`, `Image`, `Video`, `Layout`, plus `Custom` (user-defined `Node` subclass that emits IR commands, not canvas calls). Every animatable property is a `Signal<T>`; structural properties (children, font family) are plain values that invalidate dependents on change.

```ts
interface Scene {
  readonly root: Group;
  readonly nodes: ReadonlyMap<string, Node>;   // explicit-id index (§6.5)
}

interface EvalContext {
  readonly time: number;     // the playhead value at evaluate() entry — the only time channel
  readonly frame: number;    // derived: round(time * fps) when the timeline carries an fps advisory
  readonly assets: AssetTable;
}

interface DisplayListBuilder {
  push(cmd: DrawCommand): void;
  resource(res: Resource): ResourceId;         // interns into DisplayList.resources
}

abstract class Node {
  readonly position: Signal<Vec2>;
  readonly rotation: Signal<number>;       // degrees
  readonly scale: Signal<Vec2>;
  readonly opacity: Signal<number>;        // 0..1
  readonly blend: Signal<BlendMode>;       // 'source-over' default
  readonly filters: Signal<FilterSpec[]>;  // constrained set, §3.4
  readonly zIndex: Signal<number>;
  readonly parent: Signal<Node | null>;

  // Computed matrix signals — Motion Canvas precedent (@computed localToWorld):
  readonly localMatrix: Signal<Mat2x3>;    // computed from position/rotation/scale
  readonly worldMatrix: Signal<Mat2x3>;    // parent.worldMatrix × localMatrix

  abstract emit(out: DisplayListBuilder, ctx: EvalContext): void;
}
```

`ctx.time` *is* the playhead value — there is no second time channel. `localMatrix`/`worldMatrix` are computed signals: lazy, cached, dependency-tracked. Moving a parent dirties exactly the descendants' `worldMatrix` chain; an unmoved subtree re-evaluates from cache. This is Motion Canvas's exact mechanism and what makes 60fps evaluation of large graphs cheap — most frames, most signals are clean.

**Z-order:** paint order is child-array order, locally reordered by `zIndex` (stable sort among siblings, Motion Canvas semantics). **Rejected:** a global z-buffer — it breaks the group-as-compositing-unit model that subtree caching and group opacity depend on.

**Purity rule restated for nodes:** `emit()` may read signals and `ctx` only. No instance mutation, no cross-frame state. Stateful behavior enters the graph exclusively via `bake()` (§2.8), which produces ordinary `Track`s targeting these same signal props.

### 3.2 Layout node

Canvas 2D gives no layout for free; Motion Canvas had to build a flexbox `Layout` system, and ours must additionally run **headless without a DOM**. Options: (1) hand-rolled flexbox subset — full control, zero deps, but flexbox is a notoriously large spec and a subset is a permanent support tax; (2) **Yoga** (`yoga-layout`, WASM) — Facebook's flexbox engine, powers React Native, identical results in browser and Node, mature TS bindings, ~95 KB wasm; (3) Taffy (Rust → WASM) — technically superior but JS bindings less mature.

**Decision: Yoga behind a `LayoutEngine` interface.** Determinism demands the *same* layout engine in browser preview and headless export — which rules out delegating to the browser's flexbox via hidden DOM (no DOM in the CLI path; browser-version layout drift would break parity anyway). The interface seam (`measure(tree) → boxes`) keeps Taffy adoptable later. Layout results are memoized as a computed signal keyed on inputs, so layout reruns only when a participating signal changes.

**Bundle consequence (budget reconciliation, §4.4):** Yoga's wasm (~95 KB raw, roughly 30–40 KB gzipped) cannot fit the 35 kB embed budget. `Layout` therefore ships as a **separate entry point, `@glissade/scene/layout`, with its own budget**; the base embed path never pays for it.

**Text measurement without upward imports:** `scene` cannot depend on a backend (§7.1 dependency rule). `scene` declares a `TextMeasurer` interface; every `RenderBackend` implements it; `mount()` and the CLI inject the active backend's measurer into the line breaker and the **pre-measure** path (§3.6) — so layout and rasterization always agree, and the package graph stays acyclic. Note: layout participation goes through scene-owned **pre-measure** (a Text node reports a fixed `intrinsicSize` and Yoga receives frozen integers), *not* a Yoga `setMeasureFunc` — see §3.6 for why that was rejected.

### 3.3 The DisplayList IR

**Decision:** `evaluate()` produces a flat array of plain-data commands plus a resource table, not direct context calls.

```ts
type ResourceId = number; // index into DisplayList.resources

type DrawCommand =
  | { op: 'save' } | { op: 'restore' }
  | { op: 'transform'; m: Mat2x3 }
  | { op: 'clip'; path: ResourceId; rule?: 'nonzero' | 'evenodd' }
  | { op: 'fillPath';   path: ResourceId; paint: Paint }
  | { op: 'strokePath'; path: ResourceId; paint: Paint; stroke: StrokeStyle }
  | { op: 'fillText';   text: string; font: FontSpec; paint: Paint; x: number; y: number }
      // one pre-broken line per command; shaping is delegated to the backend (§3.6).
      // A glyph-run op is reserved for a future self-shaping (harfbuzzjs) path.
  | { op: 'drawImage';  image: ResourceId; src?: Rect; dst: Rect; smoothing?: boolean }
  // Compositing group ≙ Skia saveLayer / temp canvas in Canvas 2D:
  | { op: 'pushGroup'; opacity: number; blend: BlendMode; filters: FilterSpec[];
      cacheKey?: string; shader?: ShaderRef /* future, §3.7 */ }
  | { op: 'popGroup' };

interface DisplayList {
  commands: DrawCommand[];
  resources: Resource[]; // Path data, decoded images, font handles, video-frame sources
  size: { w: number; h: number };
}
```

**Why an IR instead of `node.render(ctx)`** (Motion Canvas's approach, which couples its 2d package to `CanvasRenderingContext2D` forever — see its issue #364):

- **Renderer-agnosticism:** one `emit()` per node; Canvas2D, Skia, and future WebGPU consume identical command streams.
- **Diffing & caching:** DisplayLists are comparable as data — frame-over-frame diffing enables dirty-region rendering and the subtree cache (§3.5); golden-command snapshot tests are cheaper and more stable than pixel tests.
- **Serialization for remote render:** commands + resource manifest cross a `postMessage` boundary or a wire without shipping the scene graph or user code (this is also what makes the remote-studio story in §6.4 real).
- **Capability negotiation:** backends inspect commands and reject/degrade unsupported ops explicitly instead of silently misrendering.

**Rejected:** retained per-backend node mirrors (Pixi-style) — heavier, and scrub-anywhere wants stateless re-emission per frame; the signal cache already provides the retention benefit at the evaluation layer.

**The `gs diff` diagnostic substrate (0.12).** Because a DisplayList is comparable as data, an opaque golden-hash mismatch can be turned into a command-level explanation. `diffDisplayLists(a, b): DisplayDiff` (in `@glissade/scene`, a DEV/CLI tool that tree-shakes out of the embed alongside `auditCacheCold`) returns **index-aligned, positional** per-command deltas — command *i* of `a` compared to command *i* of `b`, with changed fields named (`paint`, `m`, `text`, …) and `add`/`remove` for trailing commands. The `gs diff <scene> --at <t> --against <baseline.dl.json|.png>` command prints the resulting command tree and exits non-zero on any divergence; the golden harness's `assertFrameMatches` attaches a DisplayList diff (a fresh-scene cold re-evaluation) to the thrown error, so a purity break names the exact op/field that moved. DrawCommands carry **no node id** (stamping one is an IR change that would ripple into every backend and the §3.5 cacheKey / parity goldens), so the diff is op/field-level, never node-attributed.

- **KNOWN v1 ergonomics cliff:** the alignment is purely positional — a single insert or remove early in the stream cascades into a run of "changed" deltas from that point on. A smarter LCS/Myers alignment is **DEFERRED**; the positional diff is enough to localize the field-level divergences that determinism failures actually produce.
- **`.dl.json` snapshots** (`serializeDisplayList`/`parseDisplaySnapshot`) serialize a stable DisplayList document — a baseline users commit. It is the **third versioned interchange schema** (`dlSnapshotVersion`), carrying the same §7.4 break-policy obligation as `Timeline.version` and `SidecarDoc.sidecarVersion`. The serializer reuses the one shared byte-preserving collapse-replacer that also backs the §3.5 cacheKey (opaque buffers → a length marker; functions dropped), extracted to a single function so the three call sites cannot drift.
- **`--against .png`** is a raw `encodePng` byte-compare only — no pixel-diff algorithm and no new raster path; a mismatch points the user at a `.dl.json` baseline for the command-level story.

### 3.4 RenderBackend interface and the v1 backends

```ts
interface TextMeasurer {
  measureText(text: string, font: FontSpec): TextMetrics;   // declared in scene, injected (§3.2)
}

interface RenderBackend extends TextMeasurer {
  readonly caps: { filters: Set<FilterKind>; shaders: boolean; maxTextureSize: number };
  render(list: DisplayList): void;                    // rasterize one frame
  readPixels(): Promise<Uint8ClampedArray>;           // RGBA, export path
  toVideoFrame?(timestampUs: number): VideoFrame;     // browser zero-copy encode path
  dispose(): void;
}
```

**v1 backends:**

- **`Canvas2DBackend`** (`@glissade/backend-canvas2d`) — browser; targets `HTMLCanvasElement` or `OffscreenCanvas`. **Threading:** export always runs it in a Worker (§5.1); realtime playback runs on the main thread by default — scenes without `Video` nodes may opt into Worker playback. (A `<video>` element does not exist in a Worker, so worker-side realtime Video preview would force the decoder path or per-frame bitmap relays; rather than hand-wave that cost, main-thread playback is the spec'd default.)
- **`SkiaBackend`** (`@glissade/backend-skia`) — headless CLI over **@napi-rs/canvas**: Skia-backed, prebuilt N-API binaries, fastest of the Node canvas options in current benchmarks; raw RGBA piped to FFmpeg.

**The parity argument, stated honestly.** Chrome's Canvas 2D is rasterized by Skia; @napi-rs/canvas *is* Skia — same rasterizer family, so preview and export are very close. But they are **not pixel-identical across the seam**: Chrome GPU-rasterizes (Ganesh/Graphite) while @napi-rs/canvas is CPU Skia (antialiasing coverage differs); Chrome's text path uses the platform font stack (DirectWrite/CoreText/FreeType per OS) while @napi-rs/canvas bundles FreeType; Skia versions differ. The honest claims, used consistently in this document: **(a) per-path byte-exactness** — same path, same pinned toolchain ⇒ same bytes (the Skia CLI path is the CI-grade one); **(b) browser↔Skia *perceptual* parity** with a stated SSIM floor, enforced by the §7.3 parity suite. **Rejected:** node-canvas (Cairo — a different rasterizer, guaranteeing visible preview≠export drift in antialiasing, dashes, gradients) and skia-canvas (also Skia, but slower and heavier).

**Filters:** the `FilterSpec` enum is the enumerated intersection both Skia builds support (plus the PNG fallback path) — enforced at document validation, not a passthrough CSS string. Enumerating the exact set is an M2 engineering task, not an open design question.

**Paint raster (mesh, 0.12) — the determinism tentpole.** A `mesh` Paint is rasterized by **ONE shared CPU kernel both backends run** (`scene/src/meshGradient.ts`), the same pattern as the gradient stop densifier (`densifyStops`). This is forced by a decisive finding: **@napi-rs/canvas exposes no SkSL `RuntimeEffect`/`makeShader`**, so there is no SkSL-vs-fallback fork to drift — there is exactly one kernel. It is one deterministic Shepard inverse-distance blend with a colorspace knob (`smooth`/`oklab` = IDW in OKLab; `gaussian` = a pinned-sigma weight), with **pinned named constants** (`MESH_SIGMA`, `MESH_SHEPARD_POWER`, `MESH_DOWNSCALE`) so neither backend picks its own, OKLab math reused bit-identically from `core/color.ts`, and `Uint8ClampedArray` integer quantization so the source buffer is reproducible run-to-run and identical across backends. The blit mechanism is **`clip(path) + drawImage(meshTile → bounds)`** with `imageSmoothingEnabled` pinned — *not* `createPattern`: a cross-backend pattern-matrix parity spike showed `createPattern` leaks edge-AA/alpha contamination and an uncontrolled resample filter, while clip+drawImage is fully controlled and clips to the actual fill path (so a circle/star fills correctly). Because the source ImageData is byte-identical on both backends and only the final blit's AA differs, the **Skia golden stays per-path byte-exact** and **browser↔Skia clears SSIM ≥ 0.97**. Mesh adds no per-frame state, so it rides the §3.5 group raster cache transparently (cache-on == cache-off, byte-for-byte). NO triangulator (Gouraud/Delaunay/Coons) and no cross-kind lift (solid→uniform-mesh) — both deferred. A mesh on a *stroke/text* paint (no clippable fill region) degrades to a deterministic representative solid with a one-time dev warning.

### 3.5 Subtree caching

Motion Canvas precedent: `requiresCache()` is true when `opacity < 1`, blend ≠ `source-over`, filters, or shadows apply — the subtree is drawn to a memoized cache canvas and blitted. We adopt the predicate but express it **in the IR**: such a node emits `pushGroup`/`popGroup` around its subtree. The backend realizes a group as `saveLayer` (Skia) or a pooled temporary canvas (Canvas 2D), applying opacity/blend/filter on composite — which is what makes *group* opacity correct (children don't individually fade and overlap) and masking via blend modes possible.

**Cross-frame caching:** `pushGroup.cacheKey` is a hash of the group's command slice + referenced resources, computed during emission from the signal cache (a clean subtree hashes for free). The backend keeps an LRU of rasterized group bitmaps keyed by `cacheKey`; an unchanged subtree under a changing parent transform re-blits instead of re-rasterizing. Nodes may hint `cache: true` for expensive static subtrees. The cache is a pure performance layer — semantics are identical with it disabled (it is on the §2.1 sanctioned-memoization list, and the dev harness verifies it cache-cold).

### 3.6 Text strategy

- **Shaping:** delegated to the canvas implementation (`fillText`/`measureText`) — browser Skia and @napi-rs/canvas both shape via HarfBuzz-backed Skia text. We do not ship a shaper in v1; the IR's string-carrying `fillText` op reflects that, with a glyph-run op reserved for a future harfbuzzjs path. That reservation is encoded as a comment-only seam (no real `{ op: 'glyphRun' }` variant) immediately after the `fillText` case in `packages/scene/src/displayList.ts` — its shape is deliberately left unspecified until the post-1.0 shaper work lands.
- **Line breaking is ours:** Canvas 2D has none. Core implements greedy breaking (word boundaries + CJK + manual `\n`) via the injected `TextMeasurer` (§3.2), so the breaker always measures with the rasterizer that will draw. `Text` emits pre-broken lines as `fillText` commands.
- **Fonts are explicit.** A `FontRegistry` in the Timeline's asset manifest maps family → font file, **including explicit fallback chains**. Browser main thread: `FontFace` registration + explicit `fonts.load()` per registered family/weight/style, awaited before frame 0 (`document.fonts.ready` is the wrong primitive — it resolves when *currently pending* loads settle and does not force registered-but-unloaded fonts to load). Worker: the same against the worker's own `FontFaceSet` (`self.fonts`) — Chromium-solid; the Firefox worker-fonts floor must be verified before Worker rendering is claimed as default there. Headless: `GlobalFonts.registerFromPath`. **Strict mode errors on any unregistered family**, and — because family-level checks don't catch the real killer — document validation runs a **glyph-coverage check** (code points in `Text` content against registered fonts' cmaps), erroring in strict mode / warning in dev when a glyph would hit system fallback (the "héllo 👋 renders emoji in Chrome, tofu in Skia" bug).
- **Font ingestion front door (0.12, `@glissade/core/font-ingest`).** Registration is split into a light, embed-safe registry (`fontRegistry.ts` + `cmap.ts`, in `core/index`) and a HEAVY, EXPORT/prepare-path-only ingest module reached **only via a dynamic `import()`** so its single dependency — `subset-font` (harfbuzz `hb-subset` + a wasm woff2 decoder) — tree-shakes completely out of every embed bundle (asserted by the §4.4 leak-guard in `scripts/check-size.mjs`; `subset-font` is an `optionalDependencies` entry). The front door owns: magic-byte **sniffing** (ttf / otf / ttc → straight to Skia; woff / woff2 → decoded in-process to a plain sfnt), **STATIC variable-axis instancing** (a fixed axis tuple, e.g. `{ wght: 600 }`, → ONE content-hashed static sfnt — an axis RANGE / live per-frame instancing is intentionally deferred, so a variable font collapses to the already-solved static-parity case), eager `parseCmap` so `registerFont(...)` returns coverage + a build-time `covers(text)` predicate, and the fluent `font('Inter').src(...).variable().axis('wght', 600).build()` builder (PURE — assembles a `FontPlan`, reads no bytes). Determinism: woff2→sfnt decode and instancing run ONCE here, never inside `evaluate()`; the result is a byte-stable static sfnt (identical input → identical bytes → identical hash), so no new field flows through `FontSpec`/`DisplayList` and the render path registers an instanced face exactly like any other static ttf (`GlobalFonts.registerFromPath` for plain ttf/otf — preserving existing goldens byte-for-byte; `register(Buffer)` only for a decoded woff2). `gs fonts audit <scene>` reports, per family, the declared faces, the sniffed format, the cmap coverage, and any **missing-glyph runs** for the text the scene actually renders.
- **Measurement drift (decided):** browser and CLI Skia/HarfBuzz versions differ, so sub-pixel `measureText` deltas are possible — and since the same measurer feeds layout, drift moves *entire layouts*, not just line breaks. Decision: accept + document per the per-path determinism contract (§5.5), and **quantize all layout-feeding measurements** to a single named grid, `MEASURE_QUANTUM_PX = 0.5` (exported from `@glissade/scene`; `quantize()` rounds to it). 0.5 px is the calibrated quantum — coarse enough to absorb observed FreeType-vs-DirectWrite advance drift (1/64 px is too fine), fine enough to be visually invisible. harfbuzzjs-WASM identical-everywhere shaping remains the escape hatch if real-world breakage appears. Consequence for CI: byte-exact cross-*path* assertions involving text or text-sized layout are off the table; that's what the SSIM suite is for (§7.3).

- **Layout feed: pre-measure, not `setMeasureFunc` (RATIFIED).** Text participates in flexbox via scene-owned **pre-measure**: scene code measures the Text node with the injected `TextMeasurer`, runs *its own* (§3.6) line breaking, quantizes every advance to the `MEASURE_QUANTUM_PX` grid exactly once, and reports a fixed `intrinsicSize` (width/height) as the Yoga child dimensions — Yoga only ever sees frozen integers. The alternative, registering a Yoga `setMeasureFunc` callback so wasm calls back into `measureText` during `calculateLayout`, was **considered and rejected**: it hands measure-mode line-breaking to wasm-owned code, reintroducing a second, differently-rounded breaker inside Yoga that can move text goldens, for *no* determinism gain — pre-measure already makes the engine see only quantized integers, and keeping the breaker scene-owned keeps a single, golden-tested breaking path. Pre-measure is therefore the determinism-superior design and the shipped one.

### 3.7 WebGPUBackend (future) — what the IR must allow today

Per the research verdict, GPU is an **effect layer, not the base**: shader effects (glow, displacement, chroma key, particles) arrive as **`ShaderEffect` nodes** that rasterize their subtree to a texture, run a shader pass, and composite back into the 2D pipeline — explicitly **outside the determinism guarantee** (GPU/driver per-pixel variance breaks distributed-render reproducibility; export with shaders is "best effort, single machine").

Reserved now so this slots in without IR surgery: (1) `pushGroup` already isolates a subtree into a layer — a texture, in GPU terms — so `shader?: ShaderRef` on `pushGroup` is the entire hook; (2) `ShaderRef` carries opaque uniforms (signal-driven, so shader params are animatable via ordinary Tracks) and named texture inputs; (3) `caps.shaders` lets Canvas2D/Skia backends degrade to passthrough-with-warning or hard-error per project setting. Motion Canvas validates the shape: its experimental shaders are exactly a post-pass over the node cache canvas via a shared WebGL context.

### 3.8 Image and Video nodes

**`Image`:** draws a decoded bitmap by `ResourceId`. All assets are declared in the Timeline manifest and fully decoded before playback/render begins — `evaluate()` never awaits. Missing-at-frame-time is an error, not a placeholder.

**`Video`** is the hard one: `video.currentTime` seeking is asynchronous and not frame-accurate — fatal for purity if leaked into evaluation. The scene-graph-level contract is deliberately small: `Video.emit()` is synchronous and pure **given a warmed `VideoFrameSource`** — a resource that resolves the exact decoded frame whose timestamp matches the frame-indexed media time (`mediaT = clip.trim.start + (t - clip.at) * playbackRate`, quantized to the source's frame grid). Warming is the caller's job under the §2.5 readiness precondition: the player, exporter, and editor await `VideoFrameSource.warm(t)` before evaluating; the editor debounces scrub and shows a "decoding" state while warming. Realtime preview may use a plain `<video>` element best-effort on the main thread (§3.4) and swaps to the decoder path on pause/scrub/export. The full pipeline — demuxing, decoder backpressure, lookahead buffering, **backward scrub**, and the CLI path — is normative in §5.4.

---

## 4. Runtime, Playback, and Embedding

Realtime embedding is the product; export is a second consumer of the same substrate. Everything here builds on §2: `evaluate()` is pure, and the **Playhead is a writable signal**. The runtime's only job is deciding *who writes the Playhead and when* — and getting that machinery onto a stranger's web page at minimal cost.

### 4.1 Drivers: the Playhead is written, never owned

**Decision:** time sources are a first-class `Driver` abstraction from day one. A Driver is anything that writes a time value into a Playhead; the Player's rAF clock is merely the default Driver, not a privileged one.

```ts
interface Driver {
  /** Begin writing. Call write(seconds) whenever the driven value changes. */
  start(write: (t: number) => void, ctx: DriverContext): void;
  stop(): void;
}
interface DriverContext {
  duration: number;                        // timeline duration, for normalization
  visibility: () => 'visible' | 'hidden';  // see §4.2
}

// v1 ships exactly two:
const clock  = clockDriver();                          // rAF, used by Player
const scroll = scrollDriver({ source: el, axis: 'y',   // 0..1 progress → t
                              range: [0, duration] });
```

**Why:** Theatre.js demonstrates that once props are derivations over a position signal, scroll-linked, audio-linked, and scrub-driven playback need *zero* special casing — time is just one input signal. Designing the seam now, and proving it with two genuinely different drivers (continuous clock vs. user-controlled scalar), is what guarantees v2 interactivity lands without a rewrite. **Rejected:** baking rAF into the Player as the only time source (Motion Canvas/GSAP shape) — retrofitting scroll/pointer onto a player-owned clock is exactly the surgery we're avoiding. Also rejected: Drivers pushing frames — Drivers push *time*; rendering is pulled from the signal graph, so a Driver writing at 1000 Hz costs one dirty-mark, not 1000 renders.

A pointer Driver and an audio-amplitude Driver (AnalyserNode → smoothed scalar) are v1.x — ~30-line implementations of the same interface, deliberately left as community-sized contributions.

### 4.2 The Player

The Player composes a clock Driver with playback policy. It is the *only* stateful object in the runtime, and its state is small: rate, direction, loop mode, and a base-time offset.

```ts
const player = createPlayer(timeline, {
  loop: true,            // false | true | { count: n, mode: 'restart' | 'alternate' }
  rate: 1,               // negative = reverse; settable live
  autoplay: false,
});
player.play(); player.pause();
player.seek(1.25);                    // writes Playhead directly; pure, O(log k)
player.playhead;                      // Signal<number> — readable/subscribable by anyone
player.swap(newTimeline);             // hot-swap document, playhead preserved (§4.5)
const done = await player.play({ range: [0, 2.5] }).finished;  // seconds; true = completed, false = interrupted
```

All Player time parameters (`seek`, `range`, labels) are **seconds**; export APIs use **frames** (§5.1, §5.6).

Decisions, each with its rejection:

- **Time-based, not frame-counted.** Each rAF tick computes `t = base + (now - startWallTime) * rate`; a dropped frame skips ahead, never accumulates drift. *Rejected:* `t += 1/fps` per tick — frame-counted playheads desync from wall clock under load. Realtime mode may drop frames precisely because `evaluate()` at the skipped-to time is identical to having rendered every intermediate frame.
- **Promises are completion notifications only.** `.finished` resolves `true` on natural completion, `false` on interruption (Theatre's `play()` semantics); reissued per `play()` call; awaiting it never sequences anything.
- **Reverse is `rate: -1`**, not a separate mode — nothing is "consumed," so reverse is free. `alternate` looping is a rate sign flip at boundaries.
- **Markers and `.call()`:** the Player fires a marker's registered callback only when **continuous playback crosses the marker's t in the play direction**. `seek`/scrub never fire callbacks; export never fires them; `evaluate()` never invokes them (purity). Callbacks are Player-registered, never serialized.
- **Visibility:** on `visibilitychange → hidden`, the Player freezes its wall-clock base and resumes on visible; configurable via `background: 'pause' | 'run'` (`'run'` re-bases on return so a 10s-hidden tab shows t+10s — correct for ambient loops). *Rejected:* relying on rAF throttling alone — background-throttled rAF burns battery and produces 1 Hz judder on return.
- **`prefers-reduced-motion`:** `reducedMotion: 'respect' | 'ignore' | (timeline) => Timeline`. Default `'respect'`: autoplay is suppressed and the Playhead is set to `timeline.posterTime` (§2.3; default = duration, i.e. end state). The function form lets authors supply a fade-only alternative. Player policy, not a core concern — `evaluate()` knows nothing about it.

### 4.3 Embedding surfaces

Three tiers, all wrapping one vanilla primitive:

```ts
// Tier 1 — vanilla (the real API; everything else is sugar)
import { mount } from '@glissade/core';
import { Canvas2DBackend } from '@glissade/backend-canvas2d';
const handle = mount(scene, canvasEl, { backend: Canvas2DBackend });
handle.player.play();
handle.dispose();
```

```html
<!-- Tier 2 — zero-framework custom element (its own package, @glissade/element) -->
<gs-player src="./hero.bundle.mjs" loop autoplay controls></gs-player>
```

```tsx
// Tier 3 — React adapter (@glissade/react): thin, no React in core
const playhead = usePlayhead(player);          // useSyncExternalStore over the signal
const width    = useSignal(node.width);        // any Signal<T> → React state
<ScenePlayer scene={scene} loop controls onFinished={...} />
```

**Decision:** vanilla core, framework adapters as leaf packages. `useSyncExternalStore` is the bridge because signals already expose `subscribe` + synchronous `peek` (§2.1); the adapter is ~50 lines. **Why:** framework-agnosticism is verified gap #1 — Revideo users explicitly asked for Vue; every incumbent is wedded to one paradigm. **Rejected:** React-first (Remotion's model) — it forecloses the custom-element and Vue/Svelte stories and drags React's scheduler into the render loop. Vue/Svelte adapters are explicitly community-friendly: the contract is "Signal → your framework's reactive primitive."

**What `<gs-player>` loads:** because the Timeline document does not contain scene structure (§2.3), `src` points at a **compiled scene bundle** — an ESM module exporting `{ scene, timeline }` (the timeline may be inline or a sibling `.timeline.json`). A pure-JSON scene-description format that needs no user code is on the roadmap, not v1. **Controls (decided):** minimal CSS-part-themable controls ship behind the `controls` attribute, tree-shaken when absent; the concrete control inventory and its named sub-budget are an open design TODO (§8, item 3).

### 4.4 Bundle posture

**Budget: base embed path (`@glissade/core` + `@glissade/scene` without Layout + `@glissade/backend-canvas2d` + Player) ≤ 35 kB gzipped.** Sub-budgets (revised 2026-06-11 against measured reality — core grew the builder, springs, OKLab color, and bake(); revised again same day for the v2 §B.6 additive APIs; raised again across 0.5–0.8 for authoring features and the 0.7/0.8 determinism + backend-contract work, all of which real embeds tree-shake out): core ≤ 12 kB, scene-graph nodes ≤ 15 kB, canvas2d backend ≤ 8 kB, Player+drivers ≤ 4 kB. Measured at enforcement time: core 8.75, scene 2.73, canvas2d 1.60, player 1.31 — base path 14.39 kB gz, well inside the 35 kB envelope. Justification: anime.js does timelines in ~10 kB; Diffusion Studio's full compositing engine is 75 kB; a scene graph + evaluator should land between. Separately budgeted entry points: **`@glissade/scene/layout`** (includes Yoga wasm-base64 + bindings, ~54 kB gzipped on its own — the reason it is excluded from the base budget, §3.2; a CI guard asserts `yoga-layout` never appears in the base scene bundle) ≤ 55 kB additional; **`@glissade/element`** controls ≤ 5 kB additional. Enforced by `size-limit` in CI per entry point, failing the build.

Hard rules making the budget achievable: every node type, easing, and driver is an ES-module export (a Rect-only embed shouldn't pay for Path/Video); the builder compiles away when you ship a pre-compiled `.timeline.json`; **editor, export pipeline (WebCodecs/Mediabunny), and SkiaBackend are separate packages the embed path can never transitively import** — verified by a CI dependency-graph check, not convention.

### 4.5 Hot reload (dev)

Vite HMR accept handler in `@glissade/vite-plugin`: on scene-module change, re-run the scene function → new Timeline document → `player.swap(newTimeline)`. Because the Playhead is just a number and `evaluate()` is pure, `swap` preserves the playhead and the next frame reflects the edit — no replay-to-frame (Motion Canvas must re-run its generator to the current frame; we diff documents instead). `bake()`d tracks re-bake on swap (seeded, so reproducible); labels that vanished log a warning rather than throwing.

### 4.6 Determinism: same evaluate, different drivers

Realtime and export differ *only* in the Driver. Realtime: clock Driver writes wall-derived `t`; dropped frames are fine. Export: a step Driver writes `t = frameIndex / fps` exactly and awaits the §2.5 readiness precondition (fonts loaded, `VideoFrameSource` warmed) per the §5.5 contract. There is no "export mode" flag inside the core — if a scene looks different exported, that's a purity bug by definition, and the snapshot-test story depends on it.

### 4.7 The v2 state-machine seam

Interactivity will not add a new evaluation model. A v2 transition is: an event handler writes into the existing signal layer — retarget a Playhead to a different Timeline (or a segment between labels), tween a node signal's *base value*, or crossfade two Playheads weighting the same property. The Fran lineage (`untilB`/`switcher`: reactivity = switching between behaviors, each still `Time → value`) is the design precedent: states are Timelines, transitions are Playhead/binding rewrites, and `evaluate()` never learns about events.

```ts
// v2 sketch — nothing below requires core changes
machine.on('hover', () => player.transitionTo(hoverTimeline, { duration: 0.2 }));
```

**Transition blending (decided for everything v1 must decide):** of the two v2 interruption semantics — synthesized transition track from the live value (GSAP-style overwrite) vs. dual-playhead weight crossfade — the crossfade needs zero schema support, and the synthesized track needs only a **`from: 'live'` sentinel**, which slightly bends §2.6's explicit-from-values rule and is therefore **reserved in schema v1 now**. The choice between semantics is deferred to v2 with no rewrite possible either way.

---

## 5. Export Pipeline and Determinism

Export is a second consumer of the same pure substrate — it falls out of §2 rather than being built beside it. Because `evaluate()` is pure and produces a renderer-neutral `DisplayList`, exporting is just: for each frame `n`, evaluate at `t = n / fps`, rasterize, encode. No screenshots, no wall clock, no headless Chromium screencasting at 1–2 fps. Both v1 export paths run the **same scene code** against the same `Timeline` document. Export APIs take **frames** (Player APIs take seconds, §4.2).

### 5.1 Path A — In-browser: WebCodecs + Mediabunny in a Worker

**Decision:** the browser export path is `OffscreenCanvas` → `Canvas2DBackend` → `new VideoFrame(canvas, { timestamp: n * 1_000_000 / fps })` → `VideoEncoder` → **Mediabunny** muxing into MP4/WebM, all inside a Worker. This is **v1 scope (M3)**; the PNG-sequence path (§5.2) is the unconditional fallback, and the encoder paths are gated only on feature detection — WebCodecs export is never cut from v1.

**Why:** frame-accurate (timestamps set explicitly from frame index, never sampled from a clock), faster-than-realtime (encode as fast as the encoder drains — Mediabunny owns `encodeQueueSize`; backpressure is applied by **awaiting `CanvasSource.add`** per frame, not by reading the queue depth ourselves), hardware-accelerated, and in Chrome the canvas→VideoFrame→encoder path can stay zero-copy on the GPU. Mediabunny is the clear muxer choice: pure-TS, MPL-2.0, supersedes the deprecated `mp4-muxer`/`webm-muxer`, microsecond-accurate timestamps, streaming output with backpressure — and Remotion itself adopted it internally.

**Rejected:** `canvas.captureStream()` + MediaRecorder — realtime-only (slow frames are *dropped*, w3c/mediacapture-record#177), background-throttled (Firefox bug 1344524), no frame-accurate timestamps; a "quick preview clip" toy at most. Also rejected as default: ffmpeg.wasm (order-of-magnitude slower, software-only, ~2 GB memory ceiling) — reserved as an optional plugin for exotic codecs like ProRes.

```ts
const job = await exportVideo(timeline, {
  fps: 60, range: [0, 300],                        // frames
  video: { codec: 'h264', bitrate: 8_000_000 },    // validated via isConfigSupported
  audio: 'auto',                                   // aac → opus → none, see §5.2
  onProgress: (p) => setProgress(p),               // promise = completion notification only
});
const blob = await job.done;                       // never the sequencing substrate
```

The Worker owns its own `Playhead`, registers fonts against its own `FontFaceSet` (§3.6), awaits the readiness precondition per frame, and steps `n → n+1`; the main thread's interactive player is untouched.

**Byte-stability, stated honestly:** the browser path is **frame-accurate but encoder-dependent** — WebCodecs resolves to hardware encoders on most machines, so two machines (or one machine across a driver update) produce different bitstreams for identical frames, and GPU canvas rasterization itself varies. Bit-exact output is the CLI path's guarantee (§5.6), not the browser's.

### 5.2 Codec/format matrix and feature detection

This table is the canonical support matrix; all other sections reference it.

| Target | Video | Audio | When |
|---|---|---|---|
| MP4 (default) | H.264 (universal encode) | AAC where available | Chrome/Edge; Safari 26+ for audio |
| MP4 (compat) | H.264 | **Opus-in-MP4** | Firefox, all desktop Linux (no AAC encoder) |
| WebM | VP9 / AV1 (hw-dependent) | Opus | Safe pairing when MP4+Opus playback is a concern |
| PNG sequence + WAV | lossless RGBA | raw PCM | **unconditional fallback**; also the alpha-channel path |

Per-interface support floors (do not collapse into one number): `VideoEncoder` — Chrome 94+, Firefox 130+ (desktop; Android incomplete), Safari 16.4+. `AudioEncoder` — Chrome 94+, Firefox 130+ (desktop), **Safari 26+ only** (Safari 16.4–18.x is video-only). **Decision:** every encoder config is gated by `await VideoEncoder.isConfigSupported()` / `AudioEncoder.isConfigSupported()` before the job starts; `probeExportSupport()` returns the resolved matrix so UIs grey out options instead of failing mid-render. AV1/HEVC encode is hardware-dependent — never assume, always probe. The PNG-sequence exporter needs only canvas readback and is therefore unconditional.

### 5.3 Audio: metadata, never capture

**Decision:** audio is **timeline metadata** (`Timeline.audio`, §2.3), not a render product:

```ts
interface AudioClip {
  asset: AssetRef;          // kind 'audio'; same asset table as images/video
  at: number;               // timeline seconds (frame-quantized)
  trim?: { start: number; end: number };
  gain?: Track;             // gain envelope is just a Track targeting clip gain
  playbackRate?: number;
}
```

At export, clips are *mixed*, not captured: in the browser, decode assets (Mediabunny), schedule into an **`OfflineAudioContext`** (sample-accurate, faster than realtime), render to an `AudioBuffer`, encode via `AudioEncoder`, mux alongside video. On the CLI, the identical metadata compiles to an FFmpeg filter graph (`adelay`/`atrim`/`volume`/`amix`) applied at mux time.

**Rejected:** `MediaStream` capture of a live `AudioContext` — realtime-only, clock drift, lossy. Market signal: Motion Canvas shipped without audio export and it was a top complaint; this is v1 scope.

**Determinism scope:** audio *offsets and durations* are derived by sample-position arithmetic — `offsetSamples = round(clip.at * sampleRate)`, gain envelopes evaluated per-sample from the Track — never from any clock; video timestamps come from frame index; the two reconcile only through `fps` and `sampleRate`, so **A/V sync is exact by construction and identical across browser and CLI.** The rendered PCM bytes are **per-path deterministic at best**: browser decoders/resamplers, `OfflineAudioContext` automation interpolation, and FFmpeg's filter evaluation all differ — mirroring the video-decode caveat in §5.4.

**Publish loudness — measure→commit→pure-apply (0.12).** Platforms (YouTube/Shorts) re-normalize loudness on ingest, so the publish target is *≤ target-LUFS **and** ≤ -1 dBTP*, not an exact integrated value. glissade therefore ships loudness normalization as a **deterministic peak-clamped scalar gain**, never a two-pass limiter on the render hot path:

- **`gs measure-loudness <scene>`** (MEASURE-time / commit) builds the final mix to a WAV (the identical `collectAudioClips` + `planAudioMix` the render path uses) and runs FFmpeg's `loudnorm` measurement pass over it to read `inputI` (integrated LUFS), `inputTp` (true peak, dBTP) and `inputLra`. It commits `<scene>.loudness.json { profileId, inputI, inputTp, inputLra, gain, mixHash }` where `gain = min(targetLufs - inputI, truePeakDb - inputTp)`. The peak clamp uses the **measured** true-peak, so the published output is guaranteed ≤ -1 dBTP without any render-time oversampling.
- **At render** the committed `gain` is applied as a PURE `volume=<gain>dB` **scalar multiply on the final mix node** — one scalar in the existing filter graph, **not** a second FFmpeg pass. This stage is **bit-deterministic** (a pure gain at the same float→Int16 boundary §5.3 and `renderSfxr` golden-hash) and is the *only* render-time DSP the feature adds; the two non-deterministic stages it leans on — (a) the mix-to-PCM build and (b) measure-time `ebur128` — are **quarantined to commit/measure-time** and already conceded above (per-path PCM only). The byte-exact claim is precise: it covers the gain stage, which is where determinism matters for the golden contract.
- **mixHash** binds the committed measurement to the mix CONTENT version — a hash of the narration/music/sfx timing-manifest **bytes** (not mtime). Render recomputes it and **hard-throws**, naming `gs measure-loudness`, on a mismatch, so a re-narrate invalidates the measurement loudly rather than silently mis-normalizing. Profiles: `youtube`/`shorts` (-14 LUFS), `podcast` (-16), `broadcast`/`ebu` (-23), all at a -1 dBTP ceiling. The brickwall true-peak limiter is deferred — an un-normalized profile whose peaky source can't reach its target without clipping earns an advisory warning, not a limiter.

### 5.4 Embedded video assets (normative; §3.8 states the scene-graph contract)

`<video>.currentTime` seeking is async, flaky, and not frame-accurate — the single hardest determinism sub-problem, with its own milestone (M4, §7.5).

**Browser path:** demux the asset with Mediabunny (non-fragmented MP4 sources may be remuxed to fMP4 once at import for streamable demux), decode with WebCodecs `VideoDecoder`, and for each export frame draw the **exact decoded `VideoFrame`** whose media timestamp maps to the virtual timeline time (frame-indexed per §3.8). A **~10-frame lookahead buffer** (Replit's published production figure) keeps the decoder ahead of a monotonic playhead without unbounded memory.

**Backward and random scrub** are not covered by lookahead: the decoder must seek to the previous keyframe and decode forward — **O(GOP) per seek**, bounded by the source's keyframe interval. Strategy: the demuxer's keyframe index drives seek targets; the warming API (§3.8) exposes this cost; the editor debounces scrub and shows a decoding state; editor sessions may optionally transcode sources to all-intra once at import for O(1) scrub. This is a *readiness latency*, not cross-frame state — output for any t is unique and reproducible.

**CLI path — decision: FFmpeg frame extraction, not WebCodecs-in-Node.** Node has no native WebCodecs; libav bindings (beamcoder) are a maintenance risk and WASM decoders are slow. FFmpeg is already a hard dependency of the CLI encoder, so the CLI pre-extracts exactly the source frames the timeline references (frame-exact select filters, or a long-lived rawvideo pipe consumed by the same lookahead-buffer abstraction) and feeds them to `SkiaBackend` as images.

**Caveat, stated honestly:** browser (WebCodecs) and CLI (FFmpeg) decoders are different binaries; decoded pixels of *embedded video* may differ by ±1 LSB between paths. Cross-path parity is therefore guaranteed for vector/text/image content (Skia both sides, perceptual per §3.4) but only near-parity for video-decode output. If Node WebCodecs lands (proposed), the seam is isolated behind the `VideoFrameSource` interface and swappable.

### 5.5 The determinism contract — normative statement

This is the single normative statement; §1.3, §2.5, and §4.6 reference it.

1. **Clock:** scene code reads time only via `t`/`frame` (`ctx.time`, §3.1). No `Date.now`, `performance.now`, `setTimeout`, `requestAnimationFrame` in scene code.
2. **Randomness:** only seeded `random(seed, …)`; per-node-stable seeds derivable from node id.
3. **Fonts:** explicit registration with fallback chains; explicit `fonts.load()` awaited before frame 0 (per-context `FontFaceSet`, §3.6); glyph-coverage validation in strict mode.
4. **Media:** timestamps are frame-indexed (video) / sample-indexed (audio), never element clocks (§5.3–§5.4).
5. **State:** no cross-frame accumulation outside `bake()` (§2.8); sanctioned mutations are exactly the §2.1 list.
6. **Guarantee scope:** per-path byte-exactness on a pinned toolchain (same JS engine version + pinned native deps); browser↔Skia is perceptual parity (SSIM floor, §3.4); embedded-video and audio PCM bytes are per-path only (§5.3–§5.4); GPU/shader nodes are excluded (§3.7).

**Enforcement from day one** (Replit's ~1,200-line post-hoc clock-patching retrofit is the cautionary tale; because scene code runs against our evaluator, enforcement is cheap now and brutal later):

- **Render-mode runtime guards:** during export, the banned globals are patched *within the evaluation scope* to **throw** (CLI/CI) or **warn-once with stack** (browser; `strict: true` to throw). Scoped to `evaluate()` re-entry, never global.
- **Dev-mode parity:** the interactive player runs the same guards in warn mode plus the cache-cold re-evaluation hash check (§2.1), so violations surface during authoring.
- **Lint:** `gas/no-wall-clock`, `gas/no-unseeded-random`, `gas/no-async-in-evaluate`.
- **CI affordance:** purity makes a snapshot test one line — render frame 120, compare hash — which also makes the framework legible to agentic/LLM-driven workflows (§7.3).

### 5.6 Path B and parallelism: CLI/server rendering

**Decision:** the CLI runs the same scene code in Node, rasterizes `DisplayList`s with `SkiaBackend` on **@napi-rs/canvas**, and pipes raw RGBA (`-f rawvideo -pix_fmt rgba`) into an FFmpeg child process. No browser anywhere. This path carries the byte-exactness guarantee (§5.5 item 6); the rationale for @napi-rs/canvas over node-canvas/skia-canvas is in §3.4.

Purity makes parallelism free: any frame range renders on any worker. `gs render --workers 8` shards `0..300` (frames) into ranges; each worker pipes its segment to FFmpeg; segments concat losslessly (or two-phase encode+stitch for non-segmentable codecs). The same sharding extends across machines with zero coordination beyond range assignment — plus, for checkpointed `bake()` sources, prefix re-simulation or shipped checkpoints per §2.8. **Exclusion:** GPU/shader nodes are outside the cross-machine guarantee (§3.7); the CLI refuses to shard a scene containing them unless `--allow-gpu-shards` is passed.

```
gs render scene.ts --out out.mp4                    # full range, defaults from timeline
gs render scene.ts --range 0..300 --fps 60 --workers 8 --out out.mp4
gs render scene.ts --frame 120 --out poster.png     # single still (same path)
gs render scene.ts --watch                          # re-render stills on file change
gs render scene.ts --format png-seq --out frames/   # lossless / alpha
```

**Segment join:** determinism is frame-level (byte-identical PNGs), so neither join strategy can violate it — a sharded encode differs byte-wise from an unsharded one under *either* strategy; this is pure engineering (GOP discipline vs disk I/O). Default: concat-demuxer join with forced keyframes at shard boundaries and identical encoder settings; `--lossless-intermediate` (FFV1/rawvideo shards, single final encode) as the escape hatch. Remaining discussion in §8, item 1.

---

## 6. Editor (Studio)

### 6.1 Architecture: Vite plugin + React chrome over the open runtime

The studio ships as two packages, neither ever imported by an embed:

- **`@glissade/vite-plugin`** — dev-server integration: serves the user's project with HMR, injects the studio entry, exposes a write endpoint for persisting sidecar documents to disk (the role Motion Canvas's vite-plugin plays for `.meta` files).
- **`@glissade/studio`** — the React app: **viewport** (renders through the *same* `Canvas2DBackend` as the embed player, so preview is pixel-true by construction), **timeline panel** (tracks, keyframes, labels, scrub bar writing the Playhead), **inspector** (live signal values for the selected node; editable per §6.2), and **outline panel** (scene-graph tree + selection; structural node *creation* from the editor is deferred — node existence is code-owned per §6.2 rule 4, and a structural-edit channel is out of v1 scope).

**Signals → React** uses the `@glissade/react` adapter from §4.3 (`useSignal` = `useSyncExternalStore(sig.subscribe, sig.peek, sig.peek)`) — not a second implementation. Notifications are coalesced per ticker tick (Theatre's `dataverse` Ticker pattern), so a scrub frame that dirties 200 signals produces one React commit. The viewport does **not** go through React — it subscribes to the Playhead and re-rasterizes the DisplayList directly; React renders only chrome.

### 6.2 Code-state vs editor-state: the hybrid

**The two precedents.** *Motion Canvas* is code-is-truth: the editor owns only designated scalar escape hatches (`waitUntil` time events as draggable pills, persisted to `.meta` JSON). Clean merge story, but the inspector is essentially read-only and there is no keyframe GUI. *Theatre.js* is document-is-truth: code declares prop schemas; all keyframes live in the studio document. Full GUI power, but scene *structure* lives outside code, which fights a code-first framework: refactors churn the document, and programmatic tracks (our headline builder) have no natural home.

**Decision: hybrid — code owns structure and programmatic tracks; the editor owns keyframe data for editable tracks, persisted as a sidecar document.**

```ts
const title = add(Text({ id: 'title', text: 'Hello' }));   // explicit stable id
tl.to(title.opacity, 1, { duration: 0.5 }).editable()      // expose this track to studio
  .to(title.position.x, 300, { duration: 1 });             // code-only, GUI shows read-only
```

**The sidecar is its own schema (`SidecarDoc`), not a Timeline** — it carries `baseHash`, orphans, and editor-created tracks, none of which exist in the §2.3 interchange schema, and §7.4's stability promise must not conflate the two. It uses its own version field and file extension: `hero.scene.tsx` → `hero.edits.json`, committed to git. Tracks are **namespaced by timeline ID** with `"main"` as the v1 default, so v2's states-are-Timelines model (§4.7) extends the format instead of breaking it:

```jsonc
{ "sidecarVersion": 1,
  "timelines": {
    "main": {
      "tracks": {
        "title/opacity": {
          "baseHash": "x9f2…",                   // hash of the code-compiled baseline keys
          "keys": [ { "id": "k1", "t": 0, "value": 0 },
                    { "id": "k2", "t": 0.45, "value": 1, "ease": "easeOutCubic" } ] },
        "title/rotation": {
          "baseHash": null,                      // editor-CREATED track: no code baseline (rule 6)
          "keys": [ /* … */ ] } },
      "labels": { "beat2": 2.0 },
      "orphans": { "oldTitle/opacity": { "keys": [ /* … */ ], "reason": "node-missing" } } } } }
```

**Merge semantics** (load order: compile code → baseline Timeline; overlay sidecar; re-resolve `derived` from-keys against the merged result per §2.6 — which is what prevents value pops when a sidecar edit sits upstream of a code-only tween on the same target; the merged doc is what `evaluate()` sees):

1. **The merge unit is the whole track**, keyed by canonical track ID (§6.5). A sidecar entry for an editable track replaces the code baseline's keys entirely. Key-level three-way merging was rejected: unsolvable UX (which key "corresponds" after a retime?); track granularity keeps conflicts legible.
2. **Code changed beneath edits:** on load, recompute the baseline hash; if it differs from the stored `baseHash`, the studio badges the track *"code default changed"* with a side-by-side diff and two actions — *keep my edits* (updates `baseHash`) or *reset to code* (deletes the sidecar entry). Never silently pick either.
3. **Schema drift → orphan, never delete.** Renamed/removed node, removed prop, type-changed prop (treated as removal): the track moves to `orphans` with a reason; the studio shows a re-link UI — pick a compatible new target, rewriting the track ID. Edited data survives refactors; the user resolves drift explicitly.
4. **Code-owned, period:** node existence and hierarchy, non-editable props and tracks, Timeline duration (unless opted in via `editableDuration()`). Inspector edits to non-editable props are session-transient previews with a *"copy as code"* affordance — never persisted.
5. **Labels:** code labels are read-only pills; editor-created labels live in the sidecar; on name collision, code wins and the sidecar label is flagged for rename.
6. **Editor-created tracks:** any signal prop of an explicit-`id` node may host a track *created in the studio* for a property code never animated — stored in the sidecar with `baseHash: null` (no code baseline ⇒ no merge-conflict class). Without this, the studio is keyframe *adjustment*, not keyframe *authoring*; with it, the full-editor ambition is real.
7. **Write-back escape hatch (decided):** "extract edits to code" generates `key(...)` calls to the clipboard for a sidecar track, then deletes the sidecar entry — the same affordance and the same constraint as rule 4's "copy as code": clipboard-only, never auto-editing source.

Rejected: pure Theatre (structure outside code breaks the code-first contract), pure Motion Canvas (no real keyframe editing), and "editor writes back into your .ts source" (codegen merge against arbitrary user code is a research project, not a v1 feature).

**Sub-decision:** only nodes with an explicit `id` can host editable or editor-created tracks. Structural fallback IDs exist for inspection (§6.5) but are reorder-fragile; gating editability on explicit IDs eliminates the worst drift class up front.

### 6.3 Scrub and undo: transactions over document patches

Theatre's `studio.scrub()` is the blueprint — the cleanest published model for drag gestures coexisting with an undo stack and a reactive store:

```ts
const scrub = studio.scrub();
scrub.capture(tx => tx.moveKey('title/opacity', 'k2', { t: 1.25 }));  // each drag tick
scrub.commit();      // fold into doc + ONE undo entry; or scrub.discard()
```

During `capture`, patches apply to an **overlay layer** on the merged document; `evaluate()` reads through the overlay so the viewport previews live; `discard` drops the overlay with zero cleanup. `commit` folds it in and pushes the inverse patch. The undo stack is inverse patch lists **over the document only** — signal values are derived, never undone directly; selection/panel state is excluded. Keys carry stable `id`s (§2.2) precisely so patches address keys identically before and after retiming.

### 6.4 Editor protocol: the studio is a client, not a roommate

The studio talks to the runtime exclusively through a defined host interface:

```ts
type MergedTimeline = Timeline & {
  orphans: Record<string, { keys: Key<unknown>[]; reason: 'node-missing' | 'prop-missing' | 'type-changed' }>;
};

interface StudioHost {
  getSceneTree(): NodeDescriptor[];                    // ids, types, prop schemas, editability
  getTimeline(): MergedTimeline;                       // merged code+sidecar view + orphans
  subscribeSignal(path: SignalPath, cb: (v: unknown) => void): Unsubscribe;
  applyPatch(patches: TimelinePatch[]): PatchResult;   // validated, atomic
  setPlayhead(t: number): void;
  on(ev: 'tree-changed' | 'doc-patched' | 'playhead-moved', cb): Unsubscribe;
}
```

In the Vite dev setup this is a direct in-process implementation, but every call is structured-clone-safe by design, so the same interface runs over `postMessage` or WebSocket later. In the remote case the viewport cannot share an in-process backend — the remote runtime streams serialized `DisplayList`s (exactly what §3.3's IR was designed to allow) and the local studio rasterizes them. The runtime's studio surface is a separate entry point (`@glissade/core/studio-host`), so tree-shaking keeps every byte of editor support out of the embed bundle.

### 6.5 HMR interplay and stable IDs

Flow: code edit → Vite swaps the scene module → runtime rebuilds the scene graph and recompiles the code-baseline Timeline → sidecar overlay re-merges (§6.2) → merged doc is diffed against the previous one → `tree-changed`/`doc-patched` events fire → panels reconcile. Playhead position, selection, and panel scroll survive because they reference **stable IDs**, not object identities:

- **Nodes:** explicit `id` prop (validated unique per scene at build; duplicate = build error). Fallback for un-id'd nodes is structural — `~Group.2/Rect.0` (type + sibling ordinal path) — usable for inspection/selection, never for tracks.
- **Tracks:** `${nodeId}/${propPath}` (`title/opacity`, `title/position.x`) — the same canonical grammar as §2.2; the compile-time coalescing rule (§2.2) guarantees exactly one track per pair per Timeline, so the ID is canonical by construction.
- **Keys:** per-track monotonic `k<N>`, studio-assigned, persisted in the sidecar.

Selections whose IDs vanished are dropped; editable tracks whose IDs vanished orphan per §6.2 rule 3 — the in-memory and on-disk stories are the same code path.

### 6.6 Keyframe editing scope — v1-editor

In: select (click, marquee, multi); move keys (drag with snapping to frames/labels/other keys); add (double-click track, "key at playhead" button, or — per §6.2 rule 6 — create a new editable track on any id'd node's prop); delete; easing picker per key (named presets + raw `cubic-bezier` input); inspector numeric edits that, with auto-key enabled on an editable track, write a key at the Playhead via `scrub()`; label pills draggable with Motion Canvas-style ripple shift (modifier disables ripple). Out (v1.x): graph/curve editor, box-select retiming across tracks, copy-paste of key ranges between scenes. The deferral is safe because everything above is patches against the same document a curve editor would patch — no architectural debt.

### 6.7 License

The studio is **Apache-2.0, same as everything else** — the open-core split is rejected. Theatre.js pairs a permissive core with an AGPL studio developed in a private repo; the research flags "an optional, permissively licensed visual editor over an open core" as an unfilled gap and a stated want of the orphaned Motion Canvas community. The editor *is* the product surface; closing it would forfeit the migration pitch.

---

## 7. Packages, Repo, Tooling, and Roadmap

### 7.1 Monorepo layout

**Decision: pnpm workspaces + Turborepo.** Rejected: Lerna (Motion Canvas's choice — maintenance-mode, publish flow superseded by changesets) and Nx (opinionated generators add a learning tax for OSS contributors; Turborepo is "just a task cache over package.json scripts," keeping every package independently buildable with plain `pnpm --filter X build`). We split one level finer than Motion Canvas so the determinism boundary (core has zero DOM deps) is enforced by the package graph, not discipline:

```
packages/
  core              # Signal<T>, Track, Timeline, evaluate(), bake(), easing, seeded RNG.
                    #   ZERO DOM/Node deps — runs in browser, worker, Node, Bun. CI-lints
                    #   against `dom` lib types to enforce this. /studio-host subentry (§6.4).
  scene             # Node tree (Group/Rect/Circle/Path/Text/Image/Video/Custom), DisplayList
                    #   emission, TextMeasurer interface. /layout subentry = flexbox via Yoga
                    #   (separately budgeted, §4.4). Depends only on core.
  backend-canvas2d  # DisplayList -> CanvasRenderingContext2D/OffscreenCanvas. Browser.
  backend-skia      # DisplayList -> @napi-rs/canvas. Node-only; per-path-deterministic twin.
  player            # Embed runtime: Playhead drivers (clock, scroll), play/pause/seek/loop/swap.
  element           # <gs-player> custom element + minimal controls. Depends on player.
  react             # useSyncExternalStore bindings, <ScenePlayer>, hooks.
  vite-plugin       # Dev server integration, HMR, sidecar write endpoint (§6.1).
  studio            # React editor app (timeline GUI, inspector, scrub).
  cli               # `gs render` — headless export via backend-skia + FFmpeg mux.
  examples          # Runnable scenes; doubles as the golden-test corpus.
apps/
  docs              # Docs site (Astro Starlight or VitePress).
```

Dependency rule, enforced via `dependency-cruiser` in CI: `core ← scene ← backends ← player ← element/react/vite-plugin/studio`; nothing imports "up" (the `TextMeasurer` inversion in §3.2 exists precisely to honor this). `cli` and `studio` are the only packages allowed to be heavy.

### 7.2 npm naming

`glide_and_slide` is not a viable npm identity (underscores are nonidiomatic; bare `glide` and `slide` are both **taken**, verified against the registry). Scoped packages are the answer regardless.

**Decided (2026-06-11, see §8): project name and scope `glissade`** — a gliding dance step, the literal union of glide and slide. Repo `tyevco/glissade`; packages `@glissade/core`, `@glissade/scene`, `@glissade/backend-canvas2d`, `@glissade/backend-skia`, `@glissade/player`, `@glissade/element`, `@glissade/react`, `@glissade/vite-plugin`, `@glissade/studio`; **`gs`** as the CLI binary and **`<gs-player>`** as the custom element tag. Verified against the registry: the bare package name `glissade` is free (reserved as the unscoped umbrella/CLI package) and no `@glissade/*` packages exist; org creation on npmjs.com is the final confirmation step. History: the original choice, `@gliss` (portmanteau), was found **taken** when org creation was attempted — exactly the squatting-user risk this section had flagged. Fallbacks considered at that point: `@glissjs/*` (keep the gliss name, vuejs-style scope), `@glide-and-slide/*` (verbose but exact), `@ottercoders/*` (org-branded, weakest discoverability); the full rename to glissade won on being ownable everywhere, including the bare npm name. Rejected earlier: `@glide/*` and `@slide/*` (near-certain collisions with existing identities).

### 7.3 TypeScript, build, and testing posture

- **TypeScript:** `strict: true`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` from day one (retrofits are brutal). Public API surfaces ship `.d.ts` checked by `@arethetypeswrong/cli` and API-diffed by `api-extractor` reports committed to the repo.
- **Module format: ESM-only.** Rejected dual ESM/CJS: 2026 greenfield targeting browsers, Vite, and Node ≥ 20.19 (which `require()`s ESM natively) — dual publishing buys legacy compatibility at the cost of the dual-package hazard and a doubled build matrix. Targets: ES2022, evergreen browsers (the WebCodecs floors in §5.2 dominate anyway), Node 20+.
- **Build: tsdown** for all library packages (rolldown-based, fast, ESM-first, handles `.d.ts`; tsup's maintainers point to it as successor). Vite for the two apps (`studio`, `docs`).
- **Testing — three tiers:**
  1. **Vitest** unit tests in `core`/`scene`: easing math, Track interpolation, Signal invalidation, purity properties (`evaluate(scene, tl, t)` twice ≡ once; shuffled evaluation order ≡ sequential; cache-cold ≡ cached).
  2. **Golden-frame snapshots via SkiaBackend.** Frame N is a pure function of the document, so CI rasterizes `examples/*` at pinned frames and byte-compares PNGs — valid because CI pins the toolchain (same Node + @napi-rs/canvas versions, per §5.5's guarantee scope). This is a capability no incumbent offers — an LLM agent writes a scene and a headless test asserts frame 120: deterministic, reviewable, diffable motion graphics — and it should be presented prominently in the docs/testing story (the README headline stays with the realtime embed).
  3. **Playwright** for `player`/`element` (scrub/seek/loop in a real browser) and `studio` (editing flows). Browser-vs-Skia parity is a **perceptual-diff (SSIM threshold) suite, never byte-equality** — consistent with §3.4/§5.5; text- and layout-bearing frames are exactly where byte-comparison across the seam is impossible (§3.6).

### 7.4 Versioning, releases, license hygiene

- **Pre-1.0 policy:** all packages versioned in lockstep at `0.x`; minor = breaking allowed, patch = safe. A `BREAKING.md` log plus codemods (`@glissade/codemod`) once `studio` users exist. Three schemas are versioned independently of the API, with a stricter stability promise: the **Timeline document** (`version` field, §2.3 — the interchange format), the **SidecarDoc** (`sidecarVersion` field, §6.2 — the editor persistence layer), and the **DisplayList snapshot** (`dlSnapshotVersion` field, §3.3 — the committed `.dl.json` diff baseline). Break any and you orphan users' files.
- **Releases: changesets** + GitHub Actions publish with npm provenance. Rejected semantic-release (commit-message-driven versioning fights monorepo reality).
- **Apache-2.0 specifics:** `LICENSE` at root; `NOTICE` crediting conceptual lineage ("includes concepts inspired by Motion Canvas (MIT, © 2022 motion-canvas)") and any vendored MIT code with headers preserved. **DCO over CLA** (`Signed-off-by` enforced by a self-contained in-repo CI job, `.github/workflows/dco.yml`, not the GitHub App): CLAs depress OSS contribution and we're courting a community burned by a commercial pivot (Revideo→Midrender) — "no relicensing rug-pull" is strategic. No per-file headers; `SPDX-License-Identifier: Apache-2.0` in `package.json` fields and root files. Apache-2.0 over the research's MIT recommendation is a **locked decision** (explicit patent grant; the `@theatre/core` precedent).
- **Clean-room policy (operationalizing §1.2):** CONTRIBUTING records that Remotion's source-available code must never be read or ported for implementation work; Remotion may be referenced only via public documentation, issues, and blog posts (citations like discussion #4373 / issue #7803 are fine). This makes "clean-room" a process, not a slogan.

### 7.5 Roadmap

WebCodecs ordering (decided): the M2→M3 order below is deliberate — golden-test CI determinism is the differentiator and authoring credibility precedes export speed; pulling browser export ahead of the builder would be export-first creep in roadmap form. Recorded, closed.

| Milestone | Scope | Exit criteria | Risk retired |
|---|---|---|---|
| **M0** | This spec | Doc reviewed; Timeline schema v1 + SidecarDoc v1 drafted; editor merge story: **hybrid per §6.2 (decided in this spec)**; npm scope verified (§7.2) | editor/code split decided (proven M5) |
| **M1 — vertical proof** | `core` + `scene` (Rect/Circle/Text/Group + minimal Layout) + `backend-canvas2d` + `player` with scrub | An embedded scene plays, pauses, and seeks to arbitrary t with results identical to play-through, in a demo page | state-under-seeking: purity contract proven for declarative tracks |
| **M2 — deterministic export** | `cli` + `backend-skia`, PNG-sequence + FFmpeg mux, golden-frame CI harness, FilterSpec set enumerated | `gs render scene.ts` reproduces byte-identical PNGs on two machines running the pinned toolchain; browser↔Skia SSIM parity suite green; Text/Layout scope frozen to what parity tests cover | text/layout scope creep; per-path determinism machine-enforced |
| **M3 — authoring + audio + browser export** | `tl.to()` builder with position params; `bake()` (+ checkpointed variant); audio-as-metadata + OfflineAudioContext/FFmpeg mix; WebCodecs export with `isConfigSupported()` gating | Baked physics scene seeks correctly; audio in exported MP4/WebM; browser export degrades cleanly where AAC/AV1 encode is absent (Firefox/Linux, §5.2) | codec matrix (feature-detect + guaranteed PNG/FFmpeg fallback); state-under-seeking fully retired via `bake()` |
| **M4 — embedded video** | Browser pipeline (Mediabunny demux, `VideoDecoder`, lookahead buffer, backward-scrub via keyframe index, optional all-intra import transcode) + CLI FFmpeg frame extraction behind `VideoFrameSource` | A timeline embedding a video clip scrubs (both directions) and exports on both paths; cross-path near-parity documented and tested | the self-described "hardest determinism sub-problem" gets its own milestone instead of hiding inside another (first candidate for de-scope to v1.x if v1 slips — §8 item 4) |
| **M5 — studio alpha** | React editor: timeline GUI, keyframe editing (incl. editor-created tracks), inspector, label dragging persisted to sidecar | Edit a keyframe in GUI → survives code edit + HMR round-trip without clobbering | editor merge story proven |
| **M6 — docs + launch** | Docs site, Motion Canvas migration guide (`yield*` → builder cookbook), examples gallery, announce | Migration guide covers the MC top-10 idioms; posted to Canvas Commons/MC Discord | — (adoption risk begins) |
| **v2 themes** | Event-driven transitions/state machines on the signal layer; pointer/audio drivers; WebGPU effect backend (outside the determinism guarantee); Lottie import/export | — | GPU nondeterminism (contained by design) |

---

## 8. Decision Record

All open questions from the draft were resolved with the project author on 2026-06-11. Everything else raised in earlier drafts had already been promoted to a decision in place (track addressing §2.2; overlapping tracks §2.6; transition blending §4.7; measurement drift §3.6; write-back §6.2; WebCodecs milestone ordering §7.5; filter-set enumeration §3.4/M2; Rive marketing posture §1.5).

1. **Export segment join strategy (§5.6) — DECIDED: GOP-aligned concat.** Per-shard encodes with a forced keyframe at each range start and identical encoder settings, joined by the FFmpeg concat demuxer. `--lossless-intermediate` (FFV1/rawvideo shards + single final encode) remains as the escape hatch. Frame-level determinism is satisfied by both paths.
2. **Sidecar granularity (§6.2) — DECIDED: per-scene + project file.** One `*.edits.json` per scene module, plus a minimal `glissade.project.json` for shared editor state, initially scoped to shared markers and render presets only. Panel layouts and other studio UI state stay out of it until proven needed.
3. **`<gs-player>` controls inventory (§4.3, §4.4) — DECIDED: play/pause + scrubber + time readout.** Everything else (loop, rate, volume) via attributes/JS API, CSS parts, and slots — never default chrome. Accessibility spec still needs a design pass before M1's demo page hardens into API.
4. **Video scope in v1 (§3.8, §5.4, M4) — DECIDED: keep, as M4.** Video ships in v1 as its own milestone and is explicitly the first de-scope candidate if v1 slips; the `VideoFrameSource` seam means cutting it removes a milestone, not an architecture.
5. **Deterministic transcendental math (§2.5, §5.5) — DECIDED: same-engine scope.** Bit-exactness is guaranteed per engine + pinned toolchain; cross-engine parity stays perceptual (SSIM). fdlibm-style math revisited only if cross-engine content-addressed render caching becomes a real feature.
6. **Rive table verification (§1.5) — VERIFIED 2026-06-11.** Editor: freemium SaaS (free tier limited to 3 files; paid seats $9/$32/$120 per month). Runtimes: open source, MIT (confirmed against rive-app/rive-runtime). State machines confirmed as the core interactivity model. The §1.5 row stands as written.
7. **Naming — DECIDED (revised same day).** Project name **glissade** ("glide & slide" remains the long-form name); repo `github.com/tyevco/glissade`; npm scope `@glissade/*` with the free bare name `glissade` reserved as the unscoped umbrella/CLI package; CLI binary `gs`; custom element `<gs-player>`. History: the first choice, **gliss** / `@gliss/*`, was reverted within hours when the `@gliss` npm scope turned out to be taken (org creation attempt failed); rather than a mismatched scope (`@glissjs`), the project took the full rename to a name ownable everywhere. See §7.2.
# glissade v2 — Interactivity: State Machines & Input Drivers (Design Addendum)

**Status:** Decisions ratified 2026-06-11 — approved for implementation
**Date:** 2026-06-11

## Executive summary

1. This addendum adds an opt-in interactivity layer: state machines whose states bind ordinary Timelines, plus typed input drivers.
2. A machine is a sibling, versioned document (`StateMachineDoc`, `version: 1`); the Timeline schema and every linear pipeline are untouched.
3. Inputs are the only runtime control surface: `boolean`/`number` signals plus momentary `trigger` events; the active state is observable read-only.
4. Transitions use flat AND conditions, document-order priority, exit-time windows, and at most one taken transition per machine per step.
5. Every transition executes as offset decay over a live destination — `cut` / `decay` / `spring` policies; crossfade is a named schema reservation, not a v2.0 feature.
6. Velocity is read analytically from closed-form curves, never finite-differenced, so interruptions are C1 and cost one offset per property regardless of interruption depth.
7. The v1 `Driver` seam generalizes to `InputDriver<T>`; pointer, scroll, and offline audio reuse it unchanged, and all smoothing state lives inside driver closures, never in signals.
8. Hit testing is geometric (rect, circle/ellipse, path fill-rule) over already-cached world matrices; pixel-accurate picking is reserved.
9. Export is record → replay → bake: an event-list `InputTrace` replays bit-deterministically per trace and bakes to a plain linear Timeline any v1 consumer can use.
10. Everything ships as `@glissade/interact` behind CI-enforced size targets; core gains only additive APIs (per-target samplers, track/ease derivatives, `ValueType` operators).

## v1 invariants honored

- [x] **§2.1 signal purity.** No signal holds cross-frame state. Machine state lives outside the signal graph and is written only in the pre-read-phase step slot. The read-phase guard is **extended to the machine's non-signal mutators** — `fire()` and every plain-field mutator check `inReadPhase()` and throw `WriteDuringEvaluationError` (§A.5).
- [x] **§2.2 one track per target.** Bind-time disjointness validation covers machine-vs-machine *and* machine-vs-Player-bound timelines; overlap is a hard error, never last-writer-wins (§A.1).
- [x] **§2.3 Timeline schema untouched.** Machines are a sibling document with their own version history; machine-free pipelines never parse machine JSON (§A.4).
- [x] **§2.5 sanctioned writes.** Drivers receive the guarded `set` (as shipped in `player.ts`); `forceSet` remains private to the evaluation entry (`evaluateAt`, `binding.ts`) (§C.1).
- [x] **§2.9 substrate.** The Track/Timeline *schema* is unchanged; core *code* gains additive APIs only, enumerated explicitly in §B.6 — no existing signature breaks, new `ValueType` fields are optional.
- [x] **§4.1 driver seam.** `Driver = InputDriver<number>`; `clockDriver`/`scrollDriver` compile and behave unchanged in playhead mode (§C.1).
- [x] **§4.4 bundle posture.** The base embed path (14.39 kB gz measured) is not imported-into by anything here; `@glissade/interact` is a separate package, CI-enforced (§C.6).
- [x] **Determinism.** Every machine reachable at export time has an explicit export story or the build errors; replay is bit-deterministic per trace per pinned engine (§A.6, §B.5).

---

## A. State machine model & document schema

### A.1 Graph model: states bind Timelines; one active state; layers reserved

**Decision.** A state machine is a directed graph in which each **state binds one Timeline** — referenced as an asset (`{ ref }`) or inlined — plus local playback policy (`loop`, `rate`, `onEnter`). Exactly **one state is active at a time** per machine. The machine does not subsume linear playback; it *drives* it: entering a state is "bind this state's timeline's tracks and run its local playhead," which is the existing §2.4 machinery (`bindTimeline` + a playhead signal) invoked from the Driver layer.

**Why.** States-as-Timelines is the Rive/Unity-validated decomposition, and it costs us nothing: Timelines are already the serializable, seekable, duration-known unit (§2.3). A state's duration, labels, and springs all come for free, and `bake()`d physics works inside a state untouched.

**Rejected:** states as label-delimited ranges of one master timeline (Lottie-interactivity's frame-segments model). It couples every state's edit to one document, breaks independent looping/rates, and forecloses reusing a timeline in two machines. A state *may* reference a `sync`-mode child timeline asset, which recovers the "segments of one document" workflow without the coupling.

- **Entry.** `initial: StateId`, mandatory, static. **Rejected:** Rive-style conditioned entry transitions — input-dependent initial state is a one-liner at instantiation (`createMachine(doc, { initialInputs })` then the machine settles via normal transitions on the first step), and conditional entry would force the schema to define "evaluate transitions before the first frame," a subtle semantics for marginal value.
- **Re-entry playhead policy.** Per-state `onEnter: 'restart' | 'resume'`, default `'restart'`. This is load-bearing for the #1 common case (hover in → out → in within 300 ms: does `tl-hover` restart or pick up where it left off?), so it ships in `version: 1`, not as an extension.
- **Any-state transitions.** Yes, v2.0: `from: '*'` (global interrupts — "on `dismiss`, from anywhere, go to `exit`"). They join every state's outgoing list at lower priority than explicit edges — Unity's ordering, made explicit where Rive leaves it undocumented. A `'*'` edge **never matches the current state** unless it declares `allowSelf: true`; without this rule, a queued trigger would restart `tap` on every `press` while already in `tap`.
- **Layers / parallel machines: reserved, not shipped.** v2.0 ships single-layer machines; the schema reserves a `layers` field (additive, so v2.x can add it without a version bump). Concurrency in v2.0 is **multiple machines on one scene with statically disjoint track-target sets** — validated at bind time, hard error on overlap. The validation set **includes any Player-bound linear timeline on the same scene**: the common composition is an ambient timeline plus a machine on one button, and if both touch `playBtn/scale`, that is exactly the silent last-writer-wins §2.2 exists to kill. **Rejected:** Rive's rightmost-layer-wins ordinal conflict rule. When layers land, they get an explicit blend rule (the `additive: true` reservation from §2.2/§2.6), not an ordering convention.
- **No hierarchy in v2.0.** Nested/sub-machines reserved. The composition story is the same as Rive's in practice: a machine per component scene, inputs exposed upward.

### A.2 Inputs: the typed boundary between events and the machine

**Decision.** A machine declares typed inputs — `boolean`, `number`, `trigger` — in its document (`vec2` is a **named schema reservation**, not a v2.0 type; see §C.1 for how pointer position maps onto two `number` inputs). At runtime, boolean/number inputs are ordinary writable signals owned by the machine; **triggers are not signals** — they are momentary events appended to a queue and consumed during the machine's step (a trigger has no value to sample, and modeling "true for one frame" as a signal would smuggle frame-history semantics into the signal layer, violating §2.1's spirit).

```ts
const machine = createMachine(doc, { scene });
machine.input('hovered').set(true);     // boolean/number: Signal<T>, writable
machine.fire('clicked');                // trigger: enqueued, consumed at next step
machine.current;                        // ReadonlySignal<StateId> — observable, NOT writable
```

`machine.input(name)` and `machine.fire(name)` **throw on an unknown name** — a typo is a loud error at the call site, not a runtime mystery (and the builder's types catch it at compile time, §C.7).

Anything can write inputs: pointer listeners (hit-test → `set`/`fire`), app code, scroll/audio drivers. The existing `Driver` seam generalizes verbatim — an **InputDriver** is `start(write, ctx)/stop()` where `write` targets an input instead of the playhead; `scrollDriver` already has this shape. Inputs are the **only** runtime control surface; there is no `jumpTo(state)` in the public API (Rive's discipline — keeps machines replayable from traces) *except* a dev-mode `__forceState` for studio preview, excluded from production builds.

**Why expose `current` when Rive doesn't:** opaque runtime state is Rive's #2 community complaint; a readonly signal costs nothing and breaks no invariant. Enter/exit observation in v2.0 is "subscribe to `machine.current`"; a richer event API (`machine.on('enter' | 'exit')`) is reserved. **Rejected:** Rive's view-model/data-binding superstructure (strings, enums, converters, bidirectional bindings) — that's a data-layer product; our three primitive types plus ordinary computed signals over them cover the animation-control need.

### A.3 Transitions: conditions, exit time, duration

```ts
interface TransitionDoc {
  id: string;
  from: StateId | '*';            // '*' never matches the current state unless allowSelf
  to: StateId;
  allowSelf?: boolean;            // default false; only meaningful with from: '*'
  conditions: Condition[];        // AND; empty = always eligible (with exitTime, = "on finish")
  exitTime?: number;              // fraction of the SOURCE TIMELINE's duration [0..1]; gate, not trigger
  duration?: number;              // seconds; the transition's own clock; default 0 = hard cut
  ease?: Ease;                    // §2.2 grammar; shapes the `decay` policy's ramp
  handoff?: 'cut' | 'decay' | 'spring';  // default: value-type class (§B.1); 'crossfade' is reserved
  interruptible?: boolean;        // default true; semantics in §B.4
}

type Condition =
  | { input: string; is: boolean }                                  // boolean
  | { input: string; op: '<' | '<=' | '>' | '>='; value: number }   // number
  | { trigger: string };                                            // consumed on take
```

**Decisions, each with rejection:**

- **Grammar: flat AND-array per transition; multiple transitions = OR; priority = document order, first-match-wins, any-state edges after explicit edges.** This pins down what Rive leaves informal. **Decided** (formerly open): flat in v2.0, with a recursive `{ all: [...] } | { any: [...] }` expression tree as a **named reserved extension** — `conditions` already being an array makes the tree a new member type later. Rive and Unity both ship flat, the parallel-transitions-as-OR workaround is well understood, and `computed()` over input signals already gives code authors arbitrary derived boolean/number inputs. **Rejected:** arbitrary predicate functions — not serializable, so no studio editing and no trace replay.
- **No `==`/`!=` on number conditions.** Inputs are floats; float equality at a transition boundary is a footgun. Use two-sided thresholds, or a boolean computed input for genuinely discrete values. For noisy inputs (scroll, audio level), the idiomatic pattern is **hysteresis**: enter at `{ op: '>', value: 0.55 }`, exit at `{ op: '<', value: 0.45 }` — never a single shared threshold, which ping-pongs at the boundary (§C.4 shows this).
- **Exit time is a window-guard, not a trigger** (Unity's semantics): conditions are evaluated only once the **source state's local playhead** — which advances from state entry (§A.5) — passes `exitTime × (source timeline's duration)`; for looping states the window reopens each loop. Note the disambiguation: `exitTime` is a fraction of the *source timeline's* duration, unrelated to `TransitionDoc.duration` (the transition clock). Handoff settle dynamics **never** gate guards — values may still be decaying when the next transition fires; the next interruption simply reads the in-flight binding analytically (§B.4). A transition with `exitTime: 1` and empty conditions is the idiomatic "when finished." **Rejected:** Rive's absolute-time-or-percentage dual mode — fraction only; absolute times rot when the state's timeline is re-edited.
- **At most one transition is taken per machine per step** (Unity's rule). A taken transition cannot cascade into another in the same step; chains resolve one step at a time. This makes a cycle of empty-condition edges a slow oscillator instead of an infinite loop, and the validator **warns on empty-`conditions`, no-`exitTime` edges** (per-frame oscillators are almost always authoring mistakes).
- **Duration is the transition's own mini-clock**; the handoff policy decides what happens to property values during it. Defaults: `duration: 0` (cut) keeps trivial machines trivial; when duration > 0, the handoff policy defaults **by value-type class** (§B.1) — never by inspecting the destination timeline's content. Triggers are consumed by the first transition that takes; non-taking eligible transitions do not consume; a trigger not consumed by the end of an evaluated step is dropped (momentary semantics — the exception is a blocked non-interruptible window, §B.4).

### A.4 Serialization: a sibling, versioned StateMachineDoc

**Decision.** `StateMachineDoc` is its **own document with its own `version: 1`**, never embedded in a Timeline. It references timelines through an `assets` map (same `AssetRef` shape, §2.3) or inline. It ships as a sibling artifact (`hero.machine.json` next to `hero.timeline.json`) or inside the compiled scene bundle.

**Why.** The Timeline schema is the linear interchange format with an append-only-extension guarantee; machines must be an opt-in layer *on top* (locked invariant). Embedding would force every linear consumer — exporter, `<gs-player>`, third-party tooling — to at least parse machine fields, and would entangle two schemas' version histories. Sibling-with-references means a machine-free pipeline never sees machine JSON at all. **Rejected:** machine-as-Timeline-extension (new track kinds/markers) — same reasoning; also Rive's single-binary-blob approach, which costs git-diffability.

```json
{ "version": 1,
  "id": "button",
  "inputs": { "hovered": { "type": "boolean", "default": false },
              "press":   { "type": "trigger" } },
  "initial": "idle",
  "states": {
    "idle":  { "timeline": { "ref": "tl-idle" },  "loop": true },
    "hover": { "timeline": { "ref": "tl-hover" }, "loop": true, "rate": 1, "onEnter": "restart" },
    "tap":   { "timeline": { "ref": "tl-tap" },   "loop": false }
  },
  "transitions": [
    { "id": "t1", "from": "idle",  "to": "hover", "conditions": [{ "input": "hovered", "is": true }],
      "duration": 0.15, "handoff": "spring" },
    { "id": "t2", "from": "hover", "to": "idle",  "conditions": [{ "input": "hovered", "is": false }],
      "duration": 0.15 },
    { "id": "t3", "from": "*",     "to": "tap",   "conditions": [{ "trigger": "press" }] },
    { "id": "t4", "from": "tap",   "to": "idle",  "exitTime": 1, "conditions": [], "duration": 0.1 }
  ],
  "assets": { "tl-idle": { "kind": "timeline", "url": "./idle.timeline.json" }, "...": {} }
}
```

The `handoff` enum is **`'cut' | 'decay' | 'spring'`, defined once, here and in §B.1 identically.** `'crossfade'` is a *reserved-not-valid* member: `version: 1` validation rejects it, so no v1 document can serialize a handoff the v1 runtime doesn't implement; when the dual-playhead reservation (§4.7) lands, accepting it is an additive change. (`'snapshot'` and `'retarget'` from earlier drafts are gone: snapshot is subsumed by `decay`, retarget *is* `spring`.)

Studio metadata (node positions, colors, notes) lives in an **actual sidecar file** — `hero.machine.studio.json`, keyed by state/transition `id` — exactly the §6.2 overlay pattern, so code-authored machine docs stay clean and diffs never mix semantics with node coordinates. (An earlier draft embedded `meta.studio` inline while citing the sidecar pattern; that was the opposite of the pattern cited.)

Schema-version story mirrors the Timeline's: additive fields free; `layers`, nested machines, condition trees, `vec2` inputs, `'crossfade'`, and a per-property handoff override are the named reservations (§ cut line); breaking changes bump `version` with a migration in the loader.

### A.5 Runtime semantics: a Driver-layer object; §2.1 survives

**Decision.** `createMachine()` returns a **Driver-layer peer of the Player** — the machine is to graphs what the Player is to linear playback. Its mutable state is exactly four things, all living in the machine object (plain fields, *not* signals except where noted): **(1)** `currentState` plus `stateEnteredAt` (mirrored to a readonly signal for observers), **(2)** transition-in-progress record `{ transitionId, tSwitch }`, **(3)** input values (writable signals) + pending trigger queue, **(4)** per-state local playhead signals.

**Clocks are anchored, never accumulated.** DESIGN §4.2 rejected `t += 1/fps` frame counting because it desyncs from wall clock under load; a Δt-accumulating machine would reintroduce it. So: on state entry the machine records `stateEnteredAt = now`; each step computes the local playhead as `f(now − stateEnteredAt, rate, loop)` and the transition clock as `now − tSwitch`. Under dropped frames the machine stays wall-clock-true, exactly like the Player. **Replay determinism comes from feeding synthetic `now = frame / fps`** (§A.6), not from Δt purity: `step()` is a pure function of (doc, prior machine state, input writes since last step, `now`).

**Step ownership.** `player.attach(machine)` wires a machine to the host clock; the Player calls `machine.step(now)` on every tick, **in attach order across multiple machines, before `beginReadPhase()`**. Attached machines step on every host tick even while linear playback is paused — a paused ambient timeline must not kill button hover. `machine.dispose()` detaches, unbinds all targets, and clears listeners (the lifecycle peer of `L.dispose()`, §C.3). A machine is never self-clocking; it has no rAF of its own.

Each step does, in order: drain triggers + evaluate eligible transitions (priority order, at most one taken, §A.3); on a taken transition, compute handoff parameters (§B) and **rewire bindings via `bindSource`/`unbindSource`** — the shipped rebinding primitive (`signal.ts`); rebase entered-state clocks per `onEnter`. Then `beginReadPhase()`; `evaluate()` runs.

**Enforcement — the existing guard, extended to the machine's non-signal mutators.** `set`/`bindSource`/`unbindSource` already throw `WriteDuringEvaluationError` inside the read phase, which covers input writes and rewires. But `currentState`, the in-flight record, and the **trigger queue are plain fields the signal guard cannot see** — a `fire()` from inside a computed body, or from a `subscribe` callback running synchronously during invalidation, would otherwise mutate machine state mid-evaluation silently. So `fire()` and every plain-field mutator on the machine check `inReadPhase()` (already exported from `signal.ts`) and throw the same error. New guard call sites, same mechanism, no new mechanism *class*.

**Why this doesn't violate §2.1:** the purity rule bans cross-frame state *in signals* — signals must be pure functions of their dependencies within a frame. Machine state is cross-frame, but it lives outside the signal graph and is written only in the sanctioned pre-read slot, exactly like the playhead write (§2.5's sanctioned mutation (a), generalized from one write to one *step*). Within any frame, every property signal is still a pure pull: `() => sampleTrack(track, statePlayhead())` or, mid-transition, a pure closed-form of one such pull plus captured constants (§B.2). Same (bindings, playheads, t) → same DisplayList; scrubbing a *state's* timeline in the studio is still just `evaluate` in a loop. **Rejected:** machine-as-signal (a computed folding events over time) — precisely the stateful-reactive-node shape §2.1 exists to ban; also rejected: stepping inside `evaluate()` — it would make evaluation order-sensitive and non-reentrant, killing export parallelism.

### A.6 Determinism & export: traces, replay, bake

A live machine is non-deterministic by definition, so every machine must have one of three explicit export stories (locked invariant):

1. **Parameterized.** Inputs that are pure functions of frame — scroll progress, file-backed audio via `audioAmplitudeTrack` (§C.1) — need no trace: sweep and render.
2. **Record → replay → bake.** `recordTrace(machine, { fps })` captures an **InputTrace** (single schema, defined in §C.5): machine hash, initial input values, and an ordered event list with **raw timestamps**. Replay steps the machine at synthetic `now = frame / fps`, applying each event at its quantized frame boundary; because `step()` is pure in (doc, prior state, inputs, now), **replay of a given trace is bit-deterministic** per pinned engine (§2.5's caveat applies unchanged). Replay is frame-exact, **not** wall-clock-exact: live sessions step at rAF-variable times, so switch times — and therefore every captured `(x₀, v₀)` — differ between the live session and its replay by up to one frame of event timing. The bake reproduces *the trace* bit-identically and *approximates the session* (§B.5). `bakeTrace` then emits a **plain linear Timeline** (version-1 document, one track per bound target, frame-indexed keys — the same output contract as `bake()`, §2.8): scrubbable, diffable, consumable by any v1 pipeline with zero machine awareness. No surveyed web tool ships this first-class; it falls out of the architecture.
3. **Single-state render.** `gs render --state <name>` renders one state's timeline linearly, no trace needed.

Machines reachable at export time with none of the three are a **build error**, not a silent freeze-frame.

**Decided** (formerly open — bake fidelity): per-frame sampling of every bound target ships in v2.0 — correctness first; file size is a tooling concern. Segment-splicing (copy state-timeline key spans verbatim, synthesize keys only in transition windows) is a **reserved optimization whose output must hash-match per-frame sampling at the export fps**.

**Deferred:** `compileStatePath` (synthesize a linear timeline from a scripted state path). "Play state X for N seconds" is covered by `--state` for one state and a hand-made trace for sequences; a third export route is a third thing to test, document, and keep deterministic. Reserved for v2.x.

### A.7 Studio implications (schema only)

The graph panel needs nothing semantic added — only: **stable `id` on every state and transition** (already required above; same role as key `id`s in §2.2), the **sidecar studio file** (§A.4) for positions/colors/notes, and **document-order-as-priority** made visible (the studio renders priority badges and reordering is a semantic edit recorded in undo history — we accept this coupling because an explicit `priority` field invites gaps/duplicates and two sources of truth). Transition conditions being closed data (§A.3) is what makes a no-code condition editor possible at all — the flat grammar is deliberately the studio's UI schema.

Machine instantiation in v2.0 is **JS-only**: `createMachine` + `player.attach` (§A.5). Whether `<gs-player>` later auto-instantiates machines from a scene bundle with declarative input-mapping attributes is **Open Question 2** — that attribute surface deserves its own design pass, and shipping it half-baked would freeze attribute names into the embed API.

---

## B. Transition execution: handoff, blending, velocity

### B.1 One mechanism, three policies (decision)

**Decision:** every v2.0 transition executes as **offset decay over the destination** — the inertialization shape (Bollo, GDC 2018), specialized to glissade's low-dimensional value types. At switch time the machine stops reading the outgoing source entirely, computes a per-property offset `(x₀, v₀)` between the outgoing curve and the entering state's live sample, and installs a computed that returns `dest(t) + y(τ)` where `y` decays to zero in closed form.

| Policy | Decay curve | Continuity | Default for |
|---|---|---|---|
| `spring` | damped oscillator on the offset with initial velocity `v₀` (§B.3) | C1 | kinetic numeric types: `number`, `vec2` |
| `decay` | `y(τ) = (1 − ease(τ/d′)) · x₀` — eased ramp; `v₀` used only for the duration clamp below | C0 | `color`, opacity-like |
| `cut` | none — hard rebind | — | discrete/hold types (`string`, `boolean`) |

**Policy selection is explicit and boring:** the transition's `handoff` field if present, else the **value-type class default** declared in the registry (`ValueType.defaultHandoff`, §B.6). Policy is **never inferred from the destination timeline's content** — an earlier draft made `spring` automatic when the destination track's arriving ease was a spring, which means an animator retiming a keyframe ease inside `tl-hover` silently changes machine-wide interruption behavior with nowhere for the studio to surface it. Rejected. If a transition's explicit `handoff` is incompatible with a property's type (e.g. `spring` on `path`), that property degrades per the fallback rules below with a dev warning.

**Why type-class defaults and not one global default:** the most common interruption — hover-out mid hover-in on a position track — must get the C1 velocity-matched policy, or the framework's headline feature discards velocity in its headline case. `spring` for kinetic types, `decay` for perceptual ramps where velocity matching is invisible, `cut` for things that cannot blend. Stated here and in §A.3 identically; per-transition only — a **per-property override is cut from v2.0** and reserved (no schema field, no doubled studio editor).

**Overshoot clamp (decided, formerly OPEN B-2, now non-optional):** the `decay` policy ports Bollo's clamp — when `v₀` already points at the target, the effective decay duration is compensated, `d′ = min(d, −5x₀/v₀)` per property — our analogue of CSS's reversing-shortening factor. This is the one aesthetic failure mode of snapshot-style decay (the slow crawl on quick reversal) that two independent systems were forced to patch; it is cheap and closed-form, so it ships as part of the policy, not as an option.

**Non-extrapolating types.** `string`/`boolean` (hold-only) take `cut`. `path` has no `add/sub/scale` — a difference-of-paths offset is not even well-defined under mismatched topology (§2.2's Flubber fallback) — so it gets a **named exemption from the one-mechanism claim**: `blend-from-frozen`, defined as `vt.lerp(frozenOutgoing, dest(t), ease(τ/d))` where `frozenOutgoing` is the outgoing binding's value captured at `tSwitch`. This is a snapshot blend with exactly **one frozen value** — not a live second source, so nothing stacks: re-interruption freezes the in-flight blended value and starts over, preserving the bounded-cost property.

**Why this shape and not the textbook three.** Plain snapshot-and-tween (CSS, Unity's frozen pose) is position-only — Unity's documented "melting freeze-frame" artifact and CSS's reversing hack are both consequences of discarding velocity and tweening toward a *static* target. Offset decay subsumes it: with `decay` and a static destination it *is* snapshot-and-tween, but the destination stays live (the entering timeline keeps playing under the decaying offset), so entering motion is never frozen. **Crossfade-two-sources is rejected for v2.0 and reserved** (`'crossfade'`, §A.4): it is the only handoff whose cost stacks under interruption (three live sources after one re-interrupt — exactly why Unity snapshots and View Transitions abort), and its weighted-average trajectories only look right for phase-aligned loops, which glissade has no synced-loop primitive for yet. The §4.7 dual-playhead reservation stands; see Open Question 1. Rive's alternative — no interruption, blends must complete — is its community's top complaint and is not on the table.

This satisfies the three substrate requirements the prior-art survey converged on (read value, read velocity, start a curve with arbitrary `(x₀, v₀)`) without any cross-frame state: value and velocity are read **analytically from the outgoing closed-form curve at switch time**, never finite-differenced from rendered frames.

### B.2 bindSource mechanics: the TransitionBinding

Transitions fire in driver time — the same sanctioned write window as playhead writes (§2.1 guard intact; `bindSource` already throws inside the read phase). The installed computed is pure: `(x₀, v₀, tₛ)` are constants captured at bind time, and the only live dependency is the machine clock signal.

```ts
type HandoffPolicy =
  | { kind: 'cut' }
  | { kind: 'decay'; ease: Ease; duration: number }   // C0; v₀ used only for the duration clamp
  | { kind: 'spring'; cfg: SpringConfig };            // C1; emergent duration
// 'blend-from-frozen' is internal — the runtime's fallback for lerp-only types, never serialized.

/** Analytic value + derivative of a live source, w.r.t. the machine clock. */
interface CurveSampler<T> { value(t: number): T; velocity(t: number): T }

interface TransitionBinding<T> {
  readonly target: string;
  /** Closed-form (value, velocity) of THIS binding — the input to the next interruption. */
  readonly sampler: CurveSampler<T>;
  readonly settleTime: number;     // machine-clock time after which dest alone is exact
  dispose(): void;                 // rebind plain destination, drop the offset
}

function beginHandoff<T>(opts: {
  sig: BindableSignal<T>;
  vt: ValueType<T>;                // must declare add/sub/scale for decay/spring (§B.6)
  outgoing: CurveSampler<T>;       // previous binding's sampler (steady-state or in-flight)
  dest: CurveSampler<T>;           // entering state's live track sample
  policy: HandoffPolicy;
  tSwitch: number;                 // machine-clock time of the taking step
  clock: ReadonlySignal<number>;
}): TransitionBinding<T> {
  const { vt, dest, tSwitch: ts } = opts;
  const x0 = vt.sub(opts.outgoing.value(ts), dest.value(ts));
  const v0 = vt.sub(opts.outgoing.velocity(ts), dest.velocity(ts)); // relative velocity → exact C1
  const y = solveOffset(opts.policy, vt, x0, v0);   // τ ↦ T, closed-form (§B.3)
  opts.sig.bindSource(() => {
    const t = opts.clock();
    const tau = t - ts;
    return tau >= y.settle ? dest.value(t) : vt.add(dest.value(t), y.at(tau));
  });
  /* sampler = dest ⊕ y, both differentiable in closed form */
}
```

Mechanics per policy: `cut` rebinds `() => sampleTrack(destTrack, destPlayhead())` immediately; `decay`/`spring` install the offset computed above, and at the machine's settle tick rebind the plain destination — **steady state carries zero transition overhead**, and the rebind discontinuity is bounded by the settle tolerance.

For vectors and colors the offset spring runs **per component** (vec2, OKLab channels). *Rejected:* Bollo's direction×magnitude decomposition — necessary for quaternion joint chains, overkill for 2–4 component values where per-component clamping artifacts are invisible.

Everything this section *consumes* that does not exist in core today is enumerated in §B.6 — `bindSource`/`unbindSource` are shipped, but per-target samplers, track/ease derivatives, and the `ValueType` operators are additive core work, and pretending otherwise would misstate the §2.9 promise.

### B.3 Velocity-matched spring retargeting (extends §2.7)

The §2.7 spring is a normalized progress ease with `v₀ = 0` and an affine endpoint rescale. The retarget spring is the same oscillator on the **offset, in value units, with nonzero initial velocity** — and no affine rescale, because the offset's target is exactly 0. With `ω₀ = √(k/m)`, `ζ = c / (2√(km))`, solve `ÿ + 2ζω₀ẏ + ω₀²y = 0`, `y(0) = x₀`, `ẏ(0) = v₀`:

- **Underdamped** (ζ < 1), `ω_d = ω₀√(1−ζ²)`:
  `y(τ) = e^(−ζω₀τ) [ x₀ cos ω_dτ + ((v₀ + ζω₀x₀)/ω_d) sin ω_dτ ]`
  `ẏ(τ) = e^(−ζω₀τ) [ v₀ cos ω_dτ − ((ω₀²x₀ + ζω₀v₀)/ω_d) sin ω_dτ ]`
- **Critically damped** (ζ = 1):
  `y(τ) = e^(−ω₀τ) [ x₀ + (v₀ + ω₀x₀)τ ]`
- **Overdamped** (ζ > 1), `r± = ω₀(−ζ ± √(ζ²−1))`:
  `y(τ) = C₊e^(r₊τ) + C₋e^(r₋τ)`, `C₊ = (v₀ − r₋x₀)/(r₊−r₋)`, `C₋ = (r₊x₀ − v₀)/(r₊−r₋)`

`spring.settleTime(cfg, x₀, v₀, tol)` comes from the exponential envelope (closed-form, like `spring.duration`), so `'>'`-style sequencing after a transition still works.

**Default spring config (decided, formerly OPEN B-3):** when a transition specifies `handoff: 'spring'` (or a kinetic type defaults to it) without a config, the offset decays with `{ stiffness: 170, damping: 26, mass: 1 }` (critically-damped-ish), overridable per transition. Deriving ω₀ from the declared transition duration was rejected: under large `v₀`, duration would be a lie.

**Reading `v₀` analytically.** The outgoing steady-state binding is `lerp(a, b, ease(u))`, `u = (t−t_a)/(t_b−t_a)`; for per-component-linear types its derivative w.r.t. its own playhead is `(b−a) · ease′(u)/(t_b−t_a)` per component, multiplied by the outgoing playhead's rate (state speed × player rate) to land in machine-clock units. Three conventions, pinned so interruptions landing exactly on keys are stable across refactors: **(a)** at a key boundary, velocity is the **right derivative**; **(b)** hold segments have `v = 0`; **(c)** the §2.2 `arcLerp` vec2 variant is *not* per-component linear — its velocity is the analytic tangent of the arc parameterization, which gets its own formula in the registry (the chord formula above must not be silently applied). Ease derivatives are closed-form: cubic Béziers via `y′(s)/x′(s)` at the solved parameter, §2.7 springs via the oscillator derivative times the affine rescale factor; built-in named eases ship `d(u)` in the registry. If the outgoing binding is itself a TransitionBinding, its sampler is `dest ⊕ y` — also differentiable — so velocity is exact at any interruption depth.

### B.4 Clocks, re-interruption, interruptibility

**Decision: one transition clock per machine (per layer, when layers land); per-property initial conditions.** The machine owns a single scalar transition clock, anchored at `tSwitch` (§A.5 — anchored, not accumulated; `tSwitch` lies on the frame grid in replay only, on raw rAF time live); every TransitionBinding in that transition indexes it. Per-property `(x₀, v₀)` differ; under `spring` policy per-property settle times are emergent, and the *transition* is complete at `max(settleTime)` across its properties. Completion matters for exactly two things: dropping offsets (steady-state rebind, §B.2) and unblocking a non-interruptible transition (below). **It never gates exit-time guards** — those are measured purely on the entering state's local playhead from state entry (§A.3). *Rejected:* per-property clocks (Framer Motion's shape) — N clocks make "is the transition done" ill-defined for a machine that must fire discrete transitions; we keep Motion's per-property initial conditions without its per-property clocks. *Rejected:* gating property handoff on machine progress (Unity layer weights) — couples value math to graph bookkeeping for no benefit.

**`interruptible` semantics (the §A.3 field, delivered):** default `true` — Rive's no-interrupt behavior is its community's top complaint, so interruptible is the norm. While an `interruptible: false` transition is in flight, **transition evaluation is skipped entirely**; triggers remain queued and are *not* consumed — they are delivered at the first evaluated step after the transition completes (`max(settleTime)` for `spring`, the clamped duration for `decay`). This is the one exception to "unconsumed triggers drop at end of step" (§A.3): a blocked window holds the queue rather than dropping events the user legitimately fired. The validator warns when `interruptible: false` is combined with a spring handoff (emergent, potentially long block) — recommend it only for short fixed-duration transitions.

**Re-snapshot policy:** a second interruption at `t₂` reads `(value, velocity)` analytically from the in-flight binding's sampler, computes a fresh offset against the *new* destination, and discards the old binding. Cost is bounded at **one offset per property regardless of interruption depth** — the inertialization property — and momentum carries through every hop (contrast Unity's position-only snapshot). There is never more than one live source per property (and for `blend-from-frozen`, never more than one frozen value).

### B.5 Determinism

Transitions are **runtime constructs**: nothing in §B serializes into the *Timeline* document (the §4.7 `from: 'live'` sentinel and `additive` reservation remain the Timeline schema's only touchpoints, both additive). The export story is record-and-bake (§A.6, §C.5). Determinism claim, stated precisely: **replay of a given trace is bit-identical** — events land on the frame grid, and every quantity above (switch values, analytic velocities, oscillator decay) is closed-form, per the §2.5/§5.5 engine-pinned contract. **Replay approximates the live session** to within one frame of event timing: the live machine stepped at rAF-variable times, so live `tSwitch` values differ from their quantized replay counterparts, which perturbs every captured `(x₀, v₀)` and filter segment boundary (§C.2). Replay-to-replay: bit-stable. Session-to-replay: deterministic approximation. (An earlier draft claimed bit-identical session reproduction; that contradicted its own frame-quantization rule and is corrected here.) No velocity is ever measured from frame history; no filter has memory outside captured constants. Custom eases lacking `d(u)` fall back to a fixed-step symmetric difference (`h = 1/1024`, dev warning) — still deterministic, merely less exact.

### B.6 Core API additions required (§2.9 restated honestly)

§2.9's promise survives for the **schema** — no Track/Timeline document change — but not for core *code*. `bindSource` rewires an opaque `() => T`; everything else §B consumes is new and cannot be built outside core. The additive surface, exhaustively:

1. **Per-target samplers from `bindTimeline`** (`binding.ts`): the return value (today `{ playhead, unbind }`) additionally exposes per-target handles whose `CurveSampler` provides analytic `value`/`velocity` w.r.t. the local playhead. Additive to the return type; existing callers unaffected.
2. **`velocityAt(track, t)`** (`track.ts`): analytic track derivative, with the §B.3 conventions baked in — right derivative at key boundaries, `v = 0` on holds, dedicated arcLerp tangent.
3. **Ease derivative registry `d(u)`** (`easing.ts` — today value-side only): closed-form for named eases and cubic Béziers (`y′(s)/x′(s)`); §2.7 springs via oscillator derivative × affine rescale; missing `d(u)` on custom eases → symmetric-difference fallback with dev warning (§B.5).
4. **`ValueType` gains optional `add`/`sub`/`scale` and a `defaultHandoff` hint** (`valueTypes.ts` — today `{ id, lerp, extrapolates, equals }`). These are the same operators the reserved `additive: true` track blending (§2.2) needs — one registry extension, not two. All new fields are **optional**, so existing custom value types keep compiling. **Migration story for custom types lacking the operators:** `spring`/`decay` are unavailable; the runtime degrades that property to `blend-from-frozen` if the type lerps with clamped t, else to `cut`, with a one-time dev warning naming the type and the missing ops.

Restated compliance: *the Track/Timeline schema is untouched; core gains additive APIs.* Correspondingly, §C.6's bundle claim is qualified: the base embed path is untouched in behavior and remains within budget by tree-shaking (none of the above is reachable without `@glissade/interact` imports), but this is **verified by the existing size-limit CI on every PR, not asserted "by construction"** — interface growth in core is real and custom value-type authors see it, even though it breaks nothing.

---

## C. Drivers, listeners, and hit testing

### C.1 `InputDriver<T>`: generalize the shipped seam, don't fork it

**Decision: generalize `Driver` to `InputDriver<T>` with a defaulted type parameter; `Driver = InputDriver<number>` stays the exact v1 shape.** The §4.1 contract — a driver receives a `write` function and pushes *values*, never frames — already says nothing number-specific for `start`/`stop`/`write`; the playhead was always just the `T = number` case. A parallel `InputSource` concept was rejected: it would duplicate start/stop lifecycle, `DriverContext`, and the Player's wiring for zero semantic gain, and §2.9's whole thesis is that time is *not* special.

```ts
interface InputDriver<T = number> {
  start(write: (value: T) => void, ctx: DriverContext): void;
  stop(): void;
}
type Driver = InputDriver<number>;   // v1 alias; clockDriver/scrollDriver compile untouched

interface DriverContext {
  /** Timeline duration — present when driving a playhead; ABSENT in input mode (machines have no duration). */
  duration?: number;
  visibility: VisibilitySignal;
}
```

`DriverContext.duration` becomes **optional** — the one honest change the generalization forces. A machine has no duration, so when a machine binds `scrollDriver` to an input, `ctx.duration` is absent and `scrollDriver` defaults to writing **normalized progress 0..1** (its `range` option remaps when given). Without this, `scrollDriver` would "compile untouched" but misbehave untouched, defaulting its range against a meaningless number.

Who supplies `write` is the binding decision: the Player hands time drivers the playhead's **guarded `set`** — exactly as shipped today (`player.ts`); `forceSet` remains **private to the evaluation entry** (`evaluateAt`, `binding.ts`) and is never handed to a driver, because it skips the read-phase check and would silently remove the very protection this section relies on. A machine hands input drivers `machine.input(name).set`. Drivers never hold a signal reference — they cannot bypass the routing layer, and a driver writing at event rate (1000 Hz mouse) still costs one dirty-mark, not 1000 renders. Writes occur in event/rAF callbacks, outside the read phase, so the phase guard is satisfied by construction; a driver that writes during `evaluate()` throws, exactly as today.

```ts
const cursor = pointerDriver({
  target: canvasEl,            // events translated to scene coordinates via the root viewport transform
  smooth: spring({ stiffness: 170, damping: 26 }),   // optional; see C.2
});                            // InputDriver<Vec2> — position only; buttons are listeners (C.3)

// vec2 is NOT a machine input type in v2.0 (§A.2): fan out to two number inputs.
cursor.start(splitVec2(machine.input('cursorX').set, machine.input('cursorY').set), ctx);
```

Pointer writes are **rAF-coalesced** (Motion's `frame.read` precedent): intermediate `pointermove` events update the driver's pending target; one write lands per frame.

**Audio: offline only in v2.0.** `audioAmplitudeTrack(assetRef, { band, fps })` runs an offline FFT over the file (Remotion's `visualizeAudio` model) and compiles to an ordinary `Track` — pure-of-frame, so audio-reactive scenes with file-backed audio are **parameterized** and export with no trace at all. The realtime `audioDriver` (live mic/stream) is **deferred to v2.x**: its only export story was "documented exclusion," i.e. an admitted dead end, and the offline form covers every exportable use.

### C.2 Smoothing: stateful, therefore driver-resident — never a signal

A spring-smoothed pointer (Framer's `useSpring`) has memory: (position, velocity, target). **Decision: filter state lives inside the driver closure, full stop.** The signal graph stays time-indexed-only (§2.1); the phase guard makes the wrong implementation throw, so this rule is mechanically enforced, not stylistic. Rejected: a `smoothed(signal)` operator in core — it is exactly the velocity-aware `MotionValue` §2.1 names as the thing that breaks random access.

The implementation reuses §2.7's closed-form machinery rather than integrating: the filter is a *sequence of closed-form spring segments*. State is `(segmentStart, x₀, v₀, target)`; each retarget computes the analytic velocity of the old segment at switch time and starts a new segment from `(x, v)` — §B.3's velocity-matched retargeting, applied per input write. Consequences: realtime evaluation at arbitrary wall-clock `t` is exact (no fixed-Δt stepping needed live), and replaying the *same retarget times* reproduces the same output bit-for-bit — which is precisely what makes traces bakeable (§C.5). Live retargets happen at raw event times; replay quantizes them to the frame grid, which is the one-frame approximation §B.5 documents.

### C.3 Listeners and hit testing

Listeners convert pointer events on scene nodes into machine inputs — Rive's listener triad (target, condition, action) collapsed to functions:

```ts
const L = createListeners({ scene, element: canvasEl });
L.hover(playBtn, machine.input('hovered'));   // boolean; touch-emulated hover filtered by pointerType (Motion precedent)
L.press(playBtn, machine.input('pressed'));   // primary pointer only; true on down-over-target
L.click(playBtn, () => machine.fire('toggle'));  // fires only if release lands over the same node; else cancel
L.dispose();
```

**Hit testing — decision: geometric top-down walk over the existing signal graph, with per-node-type shape tests; pixel-accuracy reserved.**

```ts
function hitTest(scene: Scene, x: number, y: number): Node | null;
// topmost-first over nodes with `interactive: true` (set implicitly by attaching a listener);
// per candidate: p' = invert(node.worldMatrix()) · p, then a geometric containsPoint per node type:
//   Rect → anchor-aware bounds; Circle/Ellipse → radius test; Path → fill-rule test on the
//   flattened path (even-odd / nonzero); any node may override with an explicit `hitArea`
//   (cheap shape override — fat targets for thin strokes).
```

Bounding-box-only testing was rejected as below table stakes: a circular button must not hit-test as its bounding square, nor a thin diagonal path as a giant rect — and geometric shape tests are cheap, deterministic, and what PixiJS/Paper.js do by default. Only **pixel/alpha-accurate** picking is reserved (Open Question 3). Cost: O(interactive nodes) per event, one 2×3 inverse each — and `worldMatrix` is already a cached computed signal (§3.1), so unmoved subtrees cost a cache read. Non-interactive subtrees are pruned (`interactiveChildren: false`, PixiJS's flag). Rejected for v2.0: Konva's color-keyed hit buffer — pixel-perfect, but it doubles draw cost on every frame to serve occasional events, requires backend cooperation (a second DisplayList rasterization), and torpedoes the bundle/perf posture for the common case.

### C.4 Scroll: no new mode needed

**Decision: `scrollDriver` is unchanged; "input-signal mode" is just handing it a machine input's `write` instead of the playhead's** (with `ctx.duration` absent it writes normalized progress, §C.1). Both GSAP patterns fall out: `scrub` = scrollDriver → playhead (shipped v1); `toggleActions` = scrollDriver → `machine.input('scrollProgress')` with ordinary serializable conditions — **with hysteresis**, never a single threshold, which chatters at the boundary on a noisy input:

```json
{ "id": "reveal", "from": "hidden", "to": "shown",
  "conditions": [{ "input": "scrollProgress", "op": ">", "value": 0.55 }] },
{ "id": "conceal", "from": "shown", "to": "hidden",
  "conditions": [{ "input": "scrollProgress", "op": "<", "value": 0.45 }] }
```

(An earlier draft wrote this example as `when: s => s.scrollProgress > 0.5` — a predicate function, the exact grammar §A.3 rejects as unserializable. Corrected.) Rejected: a `mode: 'playhead' | 'input'` option — it would encode the routing decision inside the driver, which is exactly the coupling §4.1 exists to prevent.

### C.5 Record-and-bake: the export story for live input

Every interactive scene exports via one of the three sanctioned routes (§A.6): **parameterized**, **baked trace**, or **single-state render** — `gs render` on a machine-bound scene without a trace or `--state` **errors**.

One `InputTrace` schema (this is the §A.6 document; an earlier draft carried a second, dense-samples schema in this section that destroyed the raw timestamps the event list keeps — the event list preserves strictly more information, and the dense form is derived internally at bake time):

```ts
interface InputTrace {
  version: 1;
  machineHash: string;   // hash(machine doc) + per-referenced-timeline asset hashes
  fps: number;           // replay quantization grid (§5.5 sample-position arithmetic)
  initialInputs: Record<string, boolean | number>;
  events: Array<
    | { t: number; input: string; value: boolean | number }   // raw wall-clock t, pre-filter value
    | { t: number; fire: string }>;
}
const rec = recordTrace(machine, { fps: 60 });   // taps raw input writes; timestamps stay raw
const trace = rec.stop();
const linear: Timeline = bakeTrace(machine, trace);   // ordinary Timeline; exports like any other
```

**Decisions:**

- **Traces record *raw, pre-filter* input values at raw timestamps; replay quantizes.** Recording post-filter output would freeze smoothing parameters into the trace; raw recording keeps every take re-bakeable after tuning the spring (§C.2) — which requires keeping the raw event times, hence event-list, not dense samples.
- **Hash scope:** `machineHash` covers the machine doc plus each referenced timeline asset's hash. Mismatch at bake time is an **error**; `--force` downgrades to a warning — deliberately, because re-baking an old take against tweaked timelines is a legitimate workflow the raw-trace design exists to support.
- **A walkable capture path ships in v2.0**, not just an API: `gs dev --record` serves the scene with the machine mounted and writes `.trace.json` sidecars on stop. Without it, producing a trace means hand-writing a harness page — a workflow only the framework author would execute, which would make the "deliberate differentiator" claim hollow. The studio record button (pure UI over the same API) is v2.x.

`bakeTrace` steps from frame 0 at synthetic `now = frame/fps`: apply that frame's quantized events → `machine.step(now)` (transitions, retargets, filter segments) → sample every machine-bound property → emit frame-indexed keys. It is `bake()` (§2.8) with the machine as the stepper — output is a plain linear Timeline, so the entire §5 pipeline (sharding included: the baked document ships to all workers) is consumed unchanged. CLI: `gs render scene.ts --trace take3.trace.json --out out.mp4`.

### C.6 Packaging and bundle posture

**Decision: everything in this addendum ships as `@glissade/interact`** — machine + builder, listeners, `hitTest`, `pointerDriver`, `audioAmplitudeTrack`, trace record/bake — never imported by `core`, `scene`, `player`, or `element`, enforced by extending the §4.4 CI dependency-graph check. The base embed path (14.39 kB gz measured against the 35 kB budget) is untouched in behavior; core's additive API growth (§B.6) is held in check by the existing size-limit CI rather than asserted away. Interact size numbers are **CI targets, not measurements**: machine + listeners + hitTest + pointerDriver target ≤ 6 kB gz per entry point via `size-limit`; offline audio as a separate export targets ≤ 2 kB; trace tooling tree-shakes out of any bundle that doesn't call it. Integration points: `<gs-player>` machine mounting is **JS-only in v2.0** (`player.attach`, §A.5) — a declarative `machine` attribute is reserved pending Open Question 2; React adds `useMachineState(machine)` / `useInput(machine, name)` over the existing `useSyncExternalStore` bridge — the machine's active state and inputs are signals, so the §4.3 contract ("Signal → your framework's primitive") already covers them.

### C.7 Code-first authoring surface

DESIGN §2.6's headline is "two authoring surfaces, one document"; the machine gets the same treatment as the timeline, not a raw-JSON-only story:

```ts
const doc = machineBuilder('button')
  .input('hovered', 'boolean')                  // names flow into the types:
  .trigger('press')                             //   machine.input('hoverd') is a compile error
  .state('idle',  pose({ scale: 1, opacity: 0.8 }))          // pose state: just values —
  .state('hover', pose({ scale: 1.1, opacity: 1 }))          //   compiled to a one-key timeline,
  .state('tap',   { timeline: ref('tl-tap') })                //   no separate timeline file
  .initial('idle')
  .transition('idle', 'hover', { when: { input: 'hovered', is: true }, duration: 0.15 })
  .transition('hover', 'idle', { when: { input: 'hovered', is: false }, duration: 0.15 })
  .transition('*', 'tap', { when: { trigger: 'press' } })
  .transition('tap', 'idle', { exitTime: 1, duration: 0.1 })
  .build();                                     // → StateMachineDoc, same document either way
```

- **Builder output is the document** — same serialization, studio round-trips it.
- **Pose states** (`pose({...})`) cover the dominant "two looks, one toggle" case without authoring three files.
- **Typed inputs:** builder-produced (or `as const`) docs infer input names, so `machine.input(...)` is checked at compile time; at runtime unknown names throw (§A.2).
- **Canned presets** — `hoverMachine(node, { from, to, duration })`, `pressMachine(...)` — ship in `@glissade/interact` as thin sugar over the builder + listeners, because the showcase cases are exactly the ones competitors make one-liners (`whileHover={{ scale: 1.1 }}`).

---

## Decision Record (open questions resolved 2026-06-11)

The following were resolved in this revision and are now **decisions**, recorded inline: condition nesting (flat, tree reserved — §A.3), bake fidelity (per-frame, splice reserved with hash-match — §A.6), overshoot clamp (ported, non-optional — §B.1), default handoff spring (`{stiffness: 170, damping: 26, mass: 1}` — §B.3), capture surface (API + `gs dev --record` — §C.5), step ownership (`player.attach` — §A.5), cascading (one per step — §A.3), re-entry (`onEnter`, default restart — §A.1), vec2 (fan-out, type reserved — §A.2/§C.1), machine-vs-Player validation (§A.1), `interruptible` semantics (§B.4), handoff enum + type-class defaults (§A.4/§B.1), trace schema (§C.5). The three surviving questions were resolved with the project author, each on the recommended option:

**1. Crossfade for phase-aligned loops — DECIDED: defer to v2.x.**
*Options:* (a) ship dual-playhead weighted crossfade in v2.0 alongside offset decay; (b) defer to v2.x, keeping the §4.7 dual-playhead reservation and the reserved-not-valid `'crossfade'` enum member (§A.4).
*Recommendation:* **(b).** Crossfade only pays off with synced looping states (walk→run), which require a phase-sync primitive we haven't designed; shipping it now invites the stacking-sources interruption hole that motivated rejecting it. Revisit when looping animation states land. This is the only question with a genuine unbuilt dependency.

**2. Declarative machine mounting in `<gs-player>` — DECIDED: JS-only in v2.0.**
*Options:* (a) auto-instantiate machines found in a scene bundle, with declarative input-mapping attributes (Rive's `stateMachines:` option); (b) JS-only in v2.0 — `createMachine` + `player.attach`, with the element attribute surface designed in its own pass.
*Recommendation:* **(b).** The JS wiring is fully specified in §A.5; the attribute surface would freeze names into the embed API and deserves dedicated design. The `machine` attribute is reserved, not shipped (§C.6).

**3. Pixel-accurate hit testing — DECIDED: per-node containsPoint opt-in (when it comes, v2.x).**
*Options:* (a) per-node `containsPoint()` alpha-test override (PixiJS model: opt-in test against the node's own geometry); (b) Konva-style offscreen hit canvas behind a flag.
*Recommendation:* **(a)** — per-node opt-in keeps cost where the need is and requires no backend changes; (b) only if editor-grade picking eventually demands it. Note v2.0 already ships *geometric* shape tests (rect/circle/path fill-rule, §C.3); only alpha/pixel testing is deferred.

---

## v2.0 cut line

### Ships in v2.0

- **Machine model:** single-layer machines; `boolean`/`number`/`trigger` inputs; flat AND conditions (`<`,`<=`,`>`,`>=`, `is`, trigger); any-state edges with `allowSelf`; exit-time windows; one-transition-per-step; `onEnter: restart | resume`; `interruptible` with defined queue-hold semantics.
- **Handoff:** `cut` / `decay` (with overshoot clamp) / `spring` (velocity-matched, §B.3 closed forms); type-class defaults; `blend-from-frozen` fallback for lerp-only types; bounded one-offset re-interruption.
- **Core additive APIs (§B.6):** per-target samplers from `bindTimeline`, `velocityAt` with pinned conventions, ease `d(u)` registry, optional `ValueType.add/sub/scale` + `defaultHandoff`.
- **Document:** `StateMachineDoc` `version: 1`, sibling artifact, studio sidecar file; bind-time target-disjointness validation including Player-bound timelines.
- **Drivers & input:** `InputDriver<T>` generalization (`Driver` alias intact, `DriverContext.duration` optional); `pointerDriver` (rAF-coalesced, `splitVec2` fan-out, driver-resident spring smoothing); `scrollDriver` input mode with progress default; offline `audioAmplitudeTrack`.
- **Listeners & hit testing:** `hover`/`press`/`click`; geometric `containsPoint` per node type (rect, circle/ellipse, path fill-rule) + `hitArea` overrides; `interactiveChildren` pruning.
- **Export:** event-list `InputTrace` with `machineHash` + `initialInputs`; `recordTrace` API + `gs dev --record`; `bakeTrace` per-frame sampling to a plain linear Timeline; `gs render --trace` / `--state`; build error for machines with no export story.
- **Authoring & integration:** machine builder, pose states, typed inputs (throw on unknown), `hoverMachine`/`pressMachine` presets; `player.attach`/`machine.dispose`; React `useMachineState`/`useInput`; `@glissade/interact` package with CI size targets (≤ 6 kB gz interact core, ≤ 2 kB offline audio — targets, not measurements).

### Explicitly reserved (named schema reservations)

| Reservation | Where it lives | Mechanism |
|---|---|---|
| `layers` (parallel state layers, explicit `additive: true` blend) | `StateMachineDoc.layers` | additive field, absent in v1 docs |
| Nested / sub-machines | state schema | additive state kind |
| Condition trees `{ all: [...] } \| { any: [...] }` | `TransitionDoc.conditions` members | new array-member types, additive |
| `handoff: 'crossfade'` (dual-playhead, §4.7) | `TransitionDoc.handoff` enum | **reserved-not-valid**: v1 validation rejects it; pending Open Q1 + phase-sync primitive |
| `vec2` input type (component-addressed conditions) | `inputs[].type` | additive type tag; traces stay number/boolean/trigger until then |
| Per-property handoff override | `TransitionDoc` | no field in v1; additive later |
| Number `==`/`!=` (epsilon semantics) | `Condition.op` | additive ops if ever justified |
| Splice-based bake optimization | `bakeTrace` internals | must hash-match per-frame output at export fps |
| `compileStatePath` (scripted state-path export) | export tooling | third route, v2.x |
| Realtime `audioDriver` (live mic/stream) | `@glissade/interact` | v2.x; offline form covers exportable uses |
| Pixel/alpha-accurate hit testing | node `containsPoint` opt-in | Open Q3 |
| `<gs-player>` `machine` attribute + declarative input mapping | element API | Open Q2; JS-only until designed |
| Machine event API (`machine.on('enter' \| 'exit')`) | runtime API | `machine.current` subscription suffices in v2.0 |
| Studio trace-record button | studio | pure UI over `recordTrace`, v2.x |
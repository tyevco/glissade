# Interactivity: state machines over timelines

`@glissade/interact` is the v2 opt-in layer: state machines that *drive* the
same timelines, signals, and springs you already author — nothing in the
linear pipeline imports it, and a machine-free embed never pays for it. The
full design rationale lives in [DESIGN-V2-INTERACTIVITY.md](./DESIGN-V2-INTERACTIVITY.md).

## The model in one paragraph

A machine is a graph in which **each state binds one Timeline** and exactly
one state is active. Typed **inputs** (`boolean`, `number`, `trigger`) are the
only control surface; **transitions** carry closed, serializable conditions.
When a transition fires mid-animation, the property doesn't snap or freeze:
the machine reads the outgoing curve's value *and velocity* analytically and
decays the difference over the live destination — interruptions carry
momentum (the inertialization shape).

## Authoring

Two surfaces, one document — exactly like timelines:

```ts
import { machineBuilder, pose } from '@glissade/interact';

const doc = machineBuilder('button')
  .input('hovered', 'boolean')
  .trigger('press')
  .state('idle',  pose({ 'btn/scale': [1, 1] }))        // a pose: one-key timeline
  .state('hover', pose({ 'btn/scale': [1.08, 1.08] }))
  .state('tap',   { timeline: tlTap })                   // or any Timeline / { ref }
  .initial('idle')
  .transition('idle', 'hover', { when: { input: 'hovered', is: true }, duration: 0.15 })
  .transition('hover', 'idle', { when: { input: 'hovered', is: false }, duration: 0.15 })
  .transition('*', 'tap', { when: { trigger: 'press' } })
  .transition('tap', 'idle', { exitTime: 1, duration: 0.1 })
  .build();                                              // → StateMachineDoc (validated)
```

The output is a plain versioned JSON document (`StateMachineDoc`, a *sibling*
of the Timeline — never embedded in it). Hand-written JSON works identically;
`validateMachineDoc` rejects anything the runtime can't honor, including the
reserved `'crossfade'` handoff.

## Running

```ts
import { createMachine } from '@glissade/interact';

const machine = createMachine(doc, { resolve: scene.resolveTarget });
player.attach(machine);                 // steps every host tick, even paused
machine.input('hovered').set(true);     // boolean/number inputs are signals
machine.fire('press');                  // triggers are queued events, not signals
machine.current();                      // readonly signal of the active state id
```

`player.attach` hard-errors if the machine's track targets overlap the
player's timeline or another machine — concurrent writers to one property are
a build error, never silent last-writer-wins.

### Handoffs

Per transition, `handoff: 'cut' | 'decay' | 'spring'` — or omit it and the
value type's class decides: `number`/`vec2` get the velocity-matched offset
spring (default `{ stiffness: 170, damping: 26, mass: 1 }`, override with
`spring:`), colors blend from the frozen switch value, discrete types cut.
Re-interruption is bounded: one offset per property at any depth, with
velocity carried through every hop.

## Pointer input

```ts
import { createListeners, hitTest, pointerDriver, splitVec2 } from '@glissade/interact';

const L = createListeners({ scene, element: canvas });
L.hover(playBtn, machine.input('hovered'));   // touch-emulated hover filtered
L.press(playBtn, machine.input('pressed'));   // primary pointer, down-over-target
L.click(playBtn, () => machine.fire('toggle'));// release must land on the same node

const cursor = pointerDriver({ target: canvas, scene, smooth: { stiffness: 170, damping: 26, mass: 1 } });
cursor.start(splitVec2(machine.input('cursorX').set, machine.input('cursorY').set), { visibility: () => 'visible' });
```

Hit testing is geometric (a circle is a circle, not its bounding square),
top-down over `interactive` nodes via cached world matrices; `hitArea` makes
fat targets, `interactiveChildren: false` prunes subtrees. Pointer smoothing
lives inside the driver as closed-form spring segments — never in a signal.

### Presets

```ts
import { hoverMachine, pressMachine } from '@glissade/interact';

export default {
  createScene, timeline,
  machines: [
    hoverMachine('saveBtn', { from: { scale: [1, 1] }, to: { scale: [1.06, 1.06] } }),
    pressMachine('saveBtn', { from: { fill: '#2f6b4f' }, to: { fill: '#1f4736' } }),
  ],
};
```

A `machines: MachineSpec[]` array on your scene module is the convention the
tooling consumes: each spec is `{ doc, timelines?, wire? }`, where `wire`
attaches listeners/drivers for live sessions (replay never calls it).

## React

```tsx
import { useMachineState, useInput } from '@glissade/react';

const state = useMachineState(machine);              // re-renders on state change
const [hovered, setHovered] = useInput(machine, 'hovered');
```

## Export: every machine needs a story

A live machine is non-deterministic by definition, so `gs render` on a
machine-declaring module **errors** unless you pick a route:

1. **Parameterized** — inputs that are pure functions of frame need no trace.
   File-backed audio via `@glissade/interact/audio`:
   `audioAmplitudeTrack(decoded, { fps, band })` compiles an offline analysis
   to an ordinary Track.
2. **Record → replay → bake**:

   ```sh
   gs dev scene.ts --record        # serve the scene; Record button writes take sidecars
   gs render scene.ts --trace scene.button.take1.trace.json --out out.mp4
   ```

   Traces store **raw, pre-filter** input events, so re-baking after tuning a
   spring is legitimate (`--force` accepts a stale machine hash on purpose).
   Replay of a given trace is bit-deterministic; the baked output is a plain
   v1 Timeline any pipeline consumes with zero machine awareness.
   Programmatic: `recordTrace(machine)` / `bakeTrace(freshMachine, trace)`.
3. **Single state** — `gs render scene.ts --state hover` renders one state's
   timeline linearly over the ambient document.

## Try it

`pnpm --filter @glissade/examples dev` → the **interactive** gallery entry:
click the toggles (interrupt one mid-flight — the knob reverses with its
velocity intact), hover/press the save button, and note the third toggle
running on the plain ambient timeline next to the machines.

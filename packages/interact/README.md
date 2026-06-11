# @glissade/interact

The v2 opt-in layer: **state machines over timelines**. States bind Timelines; typed inputs (`boolean`/`number` signals + queued `trigger`s); serializable conditions; and velocity-matched handoffs — interrupt a transition mid-flight and the property reverses with its momentum intact (closed-form offset springs, never integrators). Pointer listeners with geometric hit testing, spring-smoothed `pointerDriver`, offline `audioAmplitudeTrack` (`@glissade/interact/audio`), and the deterministic export story: `recordTrace` → `bakeTrace` → a plain v1 Timeline (replay is bit-identical; verified Chromium↔Node in CI).

Never imported by the linear pipeline — a machine-free embed never pays for it. ≤ 6 kB gz for the runtime surface.

```sh
npm i @glissade/interact
```

```ts
import { machineBuilder, pose, createMachine, createListeners } from '@glissade/interact';

const doc = machineBuilder('button')
  .input('hovered', 'boolean')
  .state('idle',  pose({ 'btn/scale': [1, 1] }))
  .state('hover', pose({ 'btn/scale': [1.08, 1.08] }))
  .transition('idle', 'hover', { when: { input: 'hovered', is: true }, duration: 0.15 })
  .transition('hover', 'idle', { when: { input: 'hovered', is: false }, duration: 0.15 })
  .build();

const machine = createMachine(doc, { resolve: scene.resolveTarget });
player.attach(machine);
const L = createListeners({ scene, element: canvas });
L.hover(scene.nodes.get('btn'), machine.input('hovered'));
```

See the [interactivity guide](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md).

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

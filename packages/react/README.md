# @glissade/react

Thin React adapters over the signal graph via `useSyncExternalStore` — components re-render only when a value actually changes. Includes the v2 machine hooks, typed structurally so this package never depends on `@glissade/interact`.

```sh
npm i @glissade/react
```

```ts
import { useSignalValue, usePlayhead, useMachineState, useInput } from '@glissade/react';

const t = usePlayhead(player);
const state = useMachineState(machine);          // 'idle' | 'hover' | ...
const [hovered, setHovered] = useInput(machine, 'hovered');
```

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

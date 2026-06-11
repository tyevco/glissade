---
'@glissade/interact': minor
'@glissade/react': minor
---

Authoring surface + integration (v2 addendum §C.7). `@glissade/interact`: `machineBuilder` (typed inputs/states accumulate in the type parameters; `build()` validates and emits the same `StateMachineDoc` JSON authoring produces), `pose()` one-key-timeline states, and `hoverMachine`/`pressMachine` presets returning `MachineSpec`s with self-wiring listeners. `@glissade/react`: `useMachineState(machine)` and `useInput(machine, name)` over the existing `useSyncExternalStore` bridge — typed structurally, so react never depends on interact. The showcase gallery mounts module machines and gains an `interactive` scene: real machine-driven toggles with velocity-matched mid-flight reversal, beside an ambient-timeline toggle and preset-driven button. The interact size gate now bundles the §C.6 subset entry (machine + listeners + hitTest + pointerDriver ≤ 6 kB), verifying that builder/preset/trace tooling tree-shakes out.

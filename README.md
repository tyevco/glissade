# glide_and_slide

A TypeScript-first framework for programmatic motion graphics: realtime-first in any web page, with deterministic headless video export from the same code.

**Status:** design phase — no code yet. Start with the [Architecture & Design document](docs/DESIGN.md).

## The idea

- **One pure contract.** `evaluate(scene, timeline, t)` is a pure function of time. The same scene scrubs at 60fps in a `<canvas>`, renders frame-exact in CI, and opens in a visual studio.
- **No generator functions.** Animations are data: node properties are reactive signals, animations are serializable keyframe tracks, and a fluent GSAP-style builder compiles to that document instead of executing at play time. Seeking backward is a lookup, never a replay.
- **Renderer-agnostic core.** Evaluation produces a `DisplayList` IR consumed by pluggable backends — Canvas 2D in the browser and Skia (`@napi-rs/canvas`) headless on the CLI, with pixel parity; a WebGPU effect layer is architecturally reserved.
- **Stateful simulation without breaking purity.** `bake()` compiles physics/particles into ordinary tracks via fixed-dt, seeded pre-simulation.
- **Editor-ready.** A React-based studio (timeline, inspector, keyframe editing) is planned over the open core — same license as everything else.

Inspired by [Motion Canvas](https://github.com/motion-canvas/motion-canvas) (MIT) and, at the concept level only, Remotion. This project is a clean-room design: no Remotion code is referenced or used.

## License

[Apache-2.0](LICENSE)

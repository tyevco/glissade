---
"@glissade/cli": minor
---

`gs mcp <scene>` — the AI-native write layer: an MCP stdio server for authoring a scene

Turns `describe()` from a read-only manifest (the observation space) into a full **author → render → verify** loop (the action space). `gs mcp <scene-module>` starts a Model Context Protocol stdio server for that scene, exposing tools an agent calls without ever reading source:

- **`describe`** — the API manifest: which props are animatable, per node type.
- **`list_targets`** — the concrete `<nodeId>/<prop>` animatable targets of THIS scene (id-substituted, with value types).
- **`apply_patch`** — a **validated, reversible** Timeline Patch batch. A target that isn't animatable on this scene is rejected before it touches the doc (fail-loud write boundary); every apply records its inverse.
- **`undo`** — revert the last `apply_patch`.
- **`render_frame(t)`** — render one frame of the (patched) scene → a PNG returned inline as an image. The deterministic verifier.
- **`get_timeline`** — the current merged timeline (code + edits) as JSON.

It rides only shipped primitives — `describe()` (can't drift, examples run in CI), Timeline Patch (pure doc→doc, reversible, sidecar-merged), and a single deterministic Skia frame — so the whole loop stays pure. Lives in `@glissade/cli` (Node-only, `@modelcontextprotocol/sdk`) — never on the embed path; the base embed is unchanged.

```
gs mcp my-scene.ts   # then point an MCP client (an agent) at it
```

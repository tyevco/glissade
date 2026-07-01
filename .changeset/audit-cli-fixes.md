---
"@glissade/cli": patch
---

Audit hardening sweep: migrate props crash, --fps validation, MCP write-boundary values, and CLI fail-loud polish

Fixes from the 2026-07-01 full-app audit:

- **`gs migrate`**: an old baseline NODE lacking `props` crashed the added-props diff loop (`Cannot read properties of undefined`) — the 0.31 missing⇒empty contract now covers `node.props` on both sides (old-side missing ⇒ additive, new-side missing ⇒ breaking).
- **`--fps 0` / negative** was silently accepted and rendered the WRONG frame with exit 0 (`t = frame/0 = Infinity` clamps to the timeline end). All three fps-consuming commands now fail loud.
- **`gs mcp apply_patch`** validated targets but not VALUES: a keyframe of `'oops'` / `Infinity` (JSON `1e999`) applied `ok:true` and detonated at the next `render_frame`, poisoning the session. Values are now validated at the write boundary — the doc is untouched on rejection.
- **Layer cache**: a corrupted entry header with an intact payload could escape as a false "hit"; the decoder now rejects any payload whose length ≠ w×h×4, so every corruption is a clean miss.
- **Polish**: `gs --version`; `gs import` rejects non-`.json`/`.svg` inputs with a clear message; a typo'd scene path fails with one clean line (no phantom require stack); a multi-frame render to a `.png` path errors instead of silently creating a directory named `foo.png`; a frame range past the timeline end warns (frozen-tail padding stays possible); `gs measure-loudness` no longer prints its mix notes twice.

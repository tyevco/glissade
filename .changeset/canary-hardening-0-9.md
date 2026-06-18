---
'@glissade/core': patch
'@glissade/scene': patch
---

Hardening from the in-house 0.9 canary (all confined to the opt-in studio-host / strict-font surfaces; the determinism gate was clean):

- **Undo is now byte-exact even on un-normalized sidecars.** The snapshot-restore inverse is a `verbatim` setTrackKeys that replays the prior state as-is, instead of re-running `normalizeEditedKeys` (which re-pinned spring keys / re-nudged collisions and silently mutated the curve on externally-sourced or `setSidecarTrack`-written sidecars).
- **`parseCmap` can't hang on a corrupt font.** The format-12 group count is clamped to what the buffer holds — a truncated subtable that declared billions of groups (a ~30s stall on the `--strict` font path) now returns empty instantly.
- **The editable-host rule is enforced on the write surface.** `applyPatches` (setTrackKeys/addKey) and `setSidecarTrack` now reject structural `~Type.ordinal` / empty-nodeId targets, so a low-level consumer can't persist a sidecar track that then crashes `evaluate()`.
- **Reserved-id guard at construction.** A node id in the reserved `~` namespace throws `ReservedNodeIdError` at `createScene` (was accepted, then failed confusingly at the first tween).
- **Undo of a baseline-seeded first edit** restores `{timelines:{}}` exactly (prunes the timeline only when the transaction created it), instead of leaving an empty `{tracks:{}}` shell.

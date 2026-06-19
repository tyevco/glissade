---
"@glissade/scene": minor
"@glissade/cli": minor
---

feat(verify): `gs verify-determinism` — the cross-shard/backend divergence locator (§5.5/§5.6)

A new CLI subcommand that VERIFIES the frame-level determinism tenet a
sharded / cross-machine render leans on — without perturbing it. It emits a
`frames.manifest` (per-frame `sha256` of the raw RGBA from `backend.readPixels()`
— NOT `encodePng`, sidestepping PNG-encoder nondeterminism; `node:crypto`
sha256, no new hash dep — plus per-node DisplayList sub-hashes reusing the
shipped `serializeDisplayList`), and bisects the first divergence to a
`(frame, node, op)`.

- `gs verify-determinism <scene> [--shards N] [--against <manifest>] [--range a..b] [--bisect] [--emit <p>]`.
- `--shards N` diffs a linear render vs an N-shard render of the same range
  (each shard re-runs the module from scratch, exactly as `gs render --workers`
  does); `--against` diffs a committed / other-machine manifest; `--bisect`
  drills the divergent node via `diffDisplayLists` + `formatDisplayDiff`.
- Evaluates under the SAME `withDeterminismGuards('throw')` as `gs render`, so a
  clock/random/timer call in scene code throws DURING verification.
- HONEST SCOPE (§5.5 item 6): byte-equality is Skia↔Skia (cross-machine/shard)
  ONLY. The manifest stamps its `backend`, and an `--against` cross-backend
  byte-compare is REJECTED with a clear error — browser↔Skia is perceptual
  (SSIM) parity, never byte-identity. The full-frame RGBA hash is the byte
  authority; the per-node sub-hashes only LOCALIZE where a frame diverged.

`@glissade/scene`: `CacheColdResult` gains an additive `delta?: CommandDelta`
(the WHOLE `CommandDelta` of the first divergent leaf node's isolated emit, not
a flattened op/index — a multi-field change isn't lost). The existing
`{ ok, node? }` callers are unaffected.

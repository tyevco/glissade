---
'@glissade/cli': patch
---

0.39.0-pre.1: gs master — make `truepeak` an ACTUAL true-peak limiter (canary defect mIoSZoacbuHM)

ai-training's real-audio read (corroborated structurally by video-canary) caught
that `mode:'truepeak'` wasn't true-peak: `alimiter=limit=10^(ceilingDb/20)` is a
**sample-peak** brickwall fed a dBFS number — it holds the sample peak at −1 but
the inter-sample / TRUE peak leaked to +1.0 dBTP (clipping over the ceiling), and
`gs master`'s own verify pass then `exit 1`'d on the documented youtube/−1 config.

Fix: the limiter now **oversamples 4×** (`aresample` up → `alimiter` → `aresample`
down) so it sees and holds the inter-sample peaks, with an ~0.8 dB guard for the
downsample residue. Empirically the worst case (clipped-noise, +5.64 dBTP raw)
lands at −1.3 dBTP; a quiet source is untouched. The verify pass now passes (no
self-inflicted `exit 1`) and stays a real gate for a genuine over-ceiling.

The gain/limiter chain is shared (`loudnessFilterNodes`) between the `gs master`
verify pass and the render `filter_complex`, so the committed limiter and the
rendered output are the identical deterministic chain. Added a peaky-source
regression test asserting rendered true-peak ≤ ceiling (the fixture gap that let
the defect through: with-audio is quiet, so the limiter never engaged). The other
three mechanics (shared-target, mix-only remux, mixHash preflight) were verified
green by both seats. `masterAfChain` is now async.

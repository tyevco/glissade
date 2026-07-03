---
"@glissade/lottie": patch
---

`gs export --lottie` pre.2 — complete the sampled-key decimation. pre.1 decimated
the `sampleToLottieKeys` fallback but a second dense-sampling site — the per-axis
`scale` combined channel (`sampleComponentVec`; Lottie has no split-scale form, so
`scale.x`/`scale.y` sample to one dense channel) — bypassed the RDP pass. Both consumer
seats caught it: a real episode's 12 backdrop scale channels (11.5k keys each, ~138k of
142.8k total) survived undecimated, and a minimal repro showed a dead-linear per-axis
scale ramp keeping 61 keys instead of 2. That combined channel now runs through the same
RDP decimation, so a linear/constant per-axis scale collapses to its endpoints and real
sampled scale channels drop their key COUNT (not just per-key bytes). Fidelity and
determinism are unchanged (decimation only removes keys linear playback already
reproduces within 0.2% of each channel's range).

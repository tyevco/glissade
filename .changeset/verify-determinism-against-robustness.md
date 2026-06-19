---
'@glissade/cli': patch
---

Harden `gs verify-determinism --against`: reject an incomparable baseline grid (different `fps` or `size`) instead of silently byte-comparing the wrong frames, and stop the per-node divergence-localizer from misattributing a frame divergence to a baseline node id absent from the current render (renamed/removed nodes). Tooling-correctness only — no determinism-contract or render-path impact.

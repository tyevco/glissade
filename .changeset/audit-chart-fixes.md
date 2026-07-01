---
"@glissade/scene": patch
---

Chart: colour-by-value ramps just work + fail loud on negative data (audit fixes)

Two 0.32 sharp edges found by the full-app audit: (1) a `colorRamp` built with the DEFAULT `[0, 1]` domain passed as `Chart({ fill })` clamped every real-world value to the last stop — a uniform chart for anyone following the header example. Chart now re-domains a default-domain ramp over `[0, max(y)]` when the data ranges past 1 (explicit domains are respected verbatim; genuinely-normalized data keeps `[0,1]`). (2) All-negative data silently produced bars ~50× the chart height (the `[0,1]` fallback domain mapped `-50` to `-5000px`); negative values now throw a `ChartError` explaining the zero-baseline bar MVP and the explicit-`yScale` escape hatch.

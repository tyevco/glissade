---
"@glissade/scene": patch
---

`Chart.targets()`: fail loud on a missing prop name

`chart.targets()` with no (or an empty) argument used to emit `${id}/bars/${i}/undefined` target strings that surfaced much later as a confusing `UnboundTargetError`. It now throws `ChartError("Chart.targets(prop) needs a prop name, e.g. targets('height') or targets('fill')")` — matching Chart's otherwise-exemplary construction-time validation. Sibling to the track-layer non-numeric-keyframe guard (both close "a bad animation target should fail loud at the seam, not downstream"). Card `LPddSlVYosYg`.

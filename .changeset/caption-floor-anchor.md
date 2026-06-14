---
'@glissade/narrate': patch
---

`captionNode` autoFit now computes the fitted font and its actual wrapped line count together, so the bottom-anchor always agrees with the draw — including at the `minScale` floor, where the wrap can still exceed `maxLines` (a best-effort regime; split the segment to truly fit). No change to non-floor output.

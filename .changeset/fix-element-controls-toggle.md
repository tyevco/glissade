---
'@glissade/element': patch
---

Fix `<gs-player>`: toggling the `controls` attribute at runtime no longer resets the playhead to 0 or stops playback. The controls subtree + its scrubber/time subscription are now wired/unwired against the *current* mounted scene instead of triggering a full remount. (0.11 canary fix.)

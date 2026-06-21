---
'@glissade/element': patch
---

`<gs-player>` now supports ping-pong (yoyo) playback: the `pingpong` attribute (alias `yoyo`) selects the player's alternate loop mode (`loop: { mode: 'alternate' }`), playing the timeline forward then backward. The plain `loop` attribute remains a restart loop; defaults off, so a bare `<gs-player>` is unchanged. The player engine already supported alternate looping — this just exposes it through the element.

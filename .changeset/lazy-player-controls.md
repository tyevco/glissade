---
'@glissade/element': patch
---

`<gs-player>` now lazy-constructs its controls. With no `controls` attribute the
element builds zero controls DOM and attaches zero control listeners, and the
playhead subscription that drives the scrubber/time readout never runs. Adding
the `controls` attribute builds the play/pause button, scrubber, and time
readout live (with listeners); removing it tears them down. Theming and the CSS
`part=` selectors (`controls`/`button`/`scrubber`/`time`) are preserved exactly
when controls are present. Play/pause/seek behavior is unchanged.

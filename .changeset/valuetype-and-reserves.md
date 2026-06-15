---
'@glissade/core': minor
---

Registry & schema completeness (§2.2/§4.7/§B.6):
- `ValueType` gains optional `serialize`/`deserialize` (default identity for JSON-native types), so a custom value type can round-trip through the Timeline document.
- New registered `vec2-arc` value type: interpolates a vec2 along a circular arc (polar lerp of radius + shortest-path angle) instead of a straight chord.
- Reserved schema slots accepted (but inert) in v1 so v2 needs no migration: `Key.from: 'live'` (the §4.7 synthesized-transition sentinel) and `Track.additive` (the §B.6 blending flag — v1 stays last-wins).

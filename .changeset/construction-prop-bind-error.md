---
'@glissade/scene': minor
'@glissade/core': minor
---

0.20: friendlier construction-prop bind error. When a timeline targets
`<id>/<prop>` and the bind guard can't resolve it, a `<prop>` that is a KNOWN
construction prop (`animatable: false` in the `describe()` schema — e.g.
Image/Video `assetId`, Text `fontFamily`/`align`) now throws a specific message
("'bg/assetId' is a construction prop (animatable:false) — set it at
construction (new Image({ assetId })); it is not an animatable target.")
instead of the generic "no property signal resolves to it". A genuinely-unknown
prop still gets the generic `UnboundTargetError`.

The target was already correctly rejected — this only improves the message, so
determinism and goldens are untouched. The construction-prop NAME set is
factored into a slim shared `@glissade/scene` module that both `describe()` and
the bind guard import (the bind path imports only the tiny name lookup, never
the rich manifest), keeping the base embed within budget.

`@glissade/core`: `bindTimeline` gains an optional `BindOptions.unboundMessage`
hook (additive) so a layer with node-type context can supply the specific
reason; `UnboundTargetError` accepts an optional override message.

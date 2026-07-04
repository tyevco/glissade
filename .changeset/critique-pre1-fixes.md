---
'@glissade/scene': patch
---

0.60 pre.1 — canary verify fixes:

- **No-build load fix:** dropping the redundant `emitWithIds` assignment from the `glissade-dom` augmentation bundle — the base bundle now owns `emitWithIds` (it backs `critique()`), so the dom bundle re-assigning it collided with the base's getter-only export (`Cannot set property emitWithIds … only a getter`) on every two-script load. The base owns it now.
- **Diagnostics are discoverable:** `critique` / `validateScene` / `resolveAt` / `instanceProps` now appear in `describe().surface` with `kind: 'diagnostic'` + `iife: true` (an agent building a scene filters `kind !== 'diagnostic'`; an agent doing perception filters `=== 'diagnostic'`). The perception API is now both agent-discoverable and manifest-verified as no-build-reachable.
- **`critique(scene, timeline, { offstage })`:** an author-intent opt-out for OFF_CANVAS — node ids (matched by SUBTREE, so listing a parked Group id suppresses its whole subtree) that are intentionally off-stage are exempt. Scoped intent-declaration, never a blanket mute: an off-frame node not covered by `offstage` still fires.
- **`TEXT_OVERFLOW` now checks HEIGHT as well as width:** text that wraps within its width but whose wrapped block exceeds its box height (a clipped caption/card) now fires, with `detail.dimension` and a fix-hint that names the right lever. Closes the vertical-overflow false-negative.

Additive/pure-read: all 415 goldens byte-identical, base embed unchanged (38.67/39), `critique(clean-scene)` still returns the empty set.

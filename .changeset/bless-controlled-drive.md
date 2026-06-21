---
'@glissade/scene': minor
---

0.19: bless controlled/imperative drive mode. Add an `evaluate(scene)` overload
(no timeline argument) as the first-class entry point for a host that owns the
clock and the values — drive nodes imperatively with `node.set(...)` between
frames and render, with no timeline to compile. It evaluates against an empty
timeline at the scene's current playhead, so imperative sets survive untouched
into the DisplayList.

The precedence contract is now documented and regression-tested: a live timeline
track always overrides `set(...)` on the property it targets (last writer wins),
per property — so a timeline can own the animated props while the host drives
the rest by hand. See the new `docs/controlled-drive.md` recipe.

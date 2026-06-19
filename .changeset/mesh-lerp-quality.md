---
'@glissade/core': patch
---

Fix two silently-wrong cases in the animated-mesh `paintType.lerp` (`mesh ↔ mesh`, opt-in path). Both were already deterministic; these make them visually correct.

- **Interpolation-mode mismatch now snaps instead of pairwise-lerping.** The mesh blend kernel forks on `interpolation` (`gaussian` vs `smooth`/`oklab`), so a `smooth → gaussian` tween used to rasterize the whole way with A's kernel and then flip discretely at the boundary. A matched-point-count mesh whose `interpolation` differs now routes through the snap path (hold A — value **and** kernel — until `t ≥ 1`, then B) and emits a one-time dev warning naming the mode mismatch, consistent with the mismatched-count and cross-kind branches.
- **`bg` (mesh baseline) now fades symmetrically.** An appearing `bg` (A has none, B does) used to be dropped for the whole tween and pop in at `t ≥ 1`; a disappearing `bg` froze at A's value then snapped. Both now lift the missing side to a transparent (alpha-0) stand-in of the present color and `lerpColor` whenever **either** side has a `bg`, so it ramps in/out continuously.

No public API change. All existing goldens are byte-identical (no golden crosses these cases).

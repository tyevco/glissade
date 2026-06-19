---
"@glissade/cli": patch
"@glissade/core": patch
---

fix(0.12 canary): close four silent-wrong-output / false-verdict holes on opt-in surfaces

Four fixes from the 0.12.0-pre.0 canary review. All are on opt-in or tooling
paths; the default render output is unchanged (225 goldens stay byte-identical).

- **frame cache (`@glissade/cli`)**: the `--cache` key folded only the
  DisplayList (which carries an asset *id*, not pixels), so editing an
  `image`/`video`/`font` asset in place served STALE frames. The key context now
  folds an asset-content digest (sha256 of each referenced asset's BYTES), so an
  in-place asset edit invalidates the key.
- **`gs verify-determinism --against` (`@glissade/cli`)**: a disjoint
  baseline/render range compared zero frames yet returned a green
  `{ok:true, compared:0}`. A zero-overlap compare is now a FAILURE (exits
  non-zero) with a clear reason; a partial overlap passes but warns about the
  uncompared baseline frames.
- **loudness mixHash (`@glissade/cli`)**: `computeMixHash` hashed only the timing
  manifests, never the actual mix audio bytes, so editing a timeline clip or
  music stem in place left a stale publish gain applied silently. The hash now
  folds the BYTES of the resolved mix audio inputs (timeline clips + music stem +
  narration cache) at both measure-time and render-time, so the render-time
  stale-gain gate fires on an edited audio file.
- **`clip()` overrides (`@glissade/core`)**: a wrong-value-type override (e.g. a
  number on a `vec2` channel) sampled to NaN into both backends with no warning.
  The clip override path now asserts the override value's type matches the
  channel and throws `ClipError` on a mismatch.

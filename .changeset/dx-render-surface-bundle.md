---
'@glissade/scene': patch
'@glissade/cli': patch
---

0.14 DX bundle — three render-surface paper-cuts:

- **Clearer undeclared-asset error.** `gs render` now pre-validates every Image/Video `assetId` against `timeline.assets` before evaluation, throwing an `UnknownAssetError` that names the real mistake — an Image/Video needs an `assetId` + a `timeline.assets` entry `{ kind, url }`, not a `src` URL (§2.5: remote URLs are not fetched at render) — instead of the downstream `asset 'undefined' not ready` ColdAssetError. (Image/Video carry a new `static assetKind` marker so the walk stays robust; the validation lives in the CLI, off the embed path.)
- **No false font-validation warning for GlobalFonts/system families.** `gs render` builds an `osFamilies` set from `GlobalFonts.families` and exempts those families from the §3.6 unregistered-family check, so a family registered via `GlobalFonts.registerFromPath` (or OS-installed) no longer warns as "unregistered". A genuinely-unregistered family still warns.
- **`each()` jitter decorrelation.** The per-index motion-jitter RNG is now salted (`mix(mix(baseSeed, i), JITTER_SALT)`) so it decorrelates from `ctx.rng` (both previously derived from the same `mix(baseSeed, i)` stream). Determinism-neutral; no corpus golden uses each-jitter, so all golden frames stay byte-identical.

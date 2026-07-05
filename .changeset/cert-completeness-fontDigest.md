---
'@glissade/cli': patch
---

**0.63.2 — the render cache fails loud on an incomplete determinant set.** A determinism-safety fix for `gs render --certify`: the cert now declares when it could NOT fully content-address the fonts a scene draws, and the cache refuses to serve an incomplete cert.

The gap: `fontDigest` only content-addresses registered font faces. A scene that draws text with a SYSTEM family (`sans-serif`), or that mixes a registered face with a system one, produced an empty/partial `fontDigest` — yet the cert was treated as cacheable. Since a font/system change can't move `certHash` in that case, the local render cache could serve STALE bytes: a silent FALSE-HIT (the catastrophic direction), and the already-shipped caches hold latent ones.

- **`certVersion` 1 → 2** and a new **`complete: boolean`** on the cert base (beside `certHash`, never folded into it — the content-address is unchanged). `complete` is `false` when a text-drawing scene has any font family not captured in `fontDigest`. Computed by an identity-independent STRUCTURAL walk of the scene's drawing text nodes (deliberately not an `instanceof` check — the scene module loads through jiti, which can resolve a different class instance, silently under-counting and re-opening the hole).
- **An incomplete cert never touches the cache** — `gs render` skips both the cache read and write when `complete === false`, so it always re-renders (incomplete → re-render is safe; complete-but-wrong → false-hit is not).
- **The v1 caches are retired** — the cache is version-namespaced (entries live under `v2/`), so a v2 read can never serve a pre-fix v1 entry (which has no `complete` flag). This closes both the new and the already-cached false-hit. A v2 `gs` also rejects a v1 cert manifest on `--verify` (fail-loud on version mismatch).

Pure cache/cert logic — off the render path: all 415 goldens byte-identical, `certHash` unchanged (a test asserts flipping `complete` holds it), base embed unchanged (38.67/39), determinism `b4e6060006` intact.

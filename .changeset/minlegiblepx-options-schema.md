---
'@glissade/scene': patch
---

**0.63.1 — a per-call legibility floor + discoverable options + the loop guide in-package.** Three additive, default-preserving fast-follows from the 0.63 author-loop capstone.

- **`CritiqueOptions.minLegiblePx?: number`** (inherited by `AssessOptions`) — the legibility floor the `fontSize` geometry auto-fix must not sink below. `assess()`/`critique()` offer the `fontSize` lever only when the shrink-to-fit lands ≥ this floor (else the overflow escalates instead of auto-shrinking to an unreadable caption). Gates **both** the width- and height-overflow feasibility. Default `6` (mirrors `fitText({ minPx })`) — omitting it is byte-identical to prior behaviour. A consumer resolves a size-relative floor (`rel(size, 0.042)` → px) at their layer and passes the absolute px, so it is ratio-correct across aspect ratios. Raise it for a stricter legibility bar; lower it to let the fix shrink text further.
- **`describe()` options schema** — surface entries for `assess`/`critique` now carry an `options: SurfaceOption[]` array (`{ name, type, default?, summary }`), so a no-build agent discovers `minLegiblePx` **and** the previously-opaque `exportBound`/`accepted`/`previous`/`fps`/`offstage` from the manifest ground-truth. Also adds `describe().guides` — a pointer to the authoring-loop guide.
- **The authoring-loop guide ships in-package** — a "closed authoring loop" section in `@glissade/scene`'s README, with a two-consumer-honest import note (bundler → `@glissade/scene/diagnostics`; no-build → `window.glissade.assess/critique/certKey/diff`; the low-level classifiers are bundler-only and already applied inside `assess()`'s partition).

Pure feasibility-partition + manifest metadata: all 415 goldens byte-identical, base embed unchanged (38.67/39), determinism `b4e6060006` intact. safeArea is intentionally deferred (composes with `safeAreas: Region[]` when CAPTION_COLLISION lands — a symmetric fraction would be the wrong shape for asymmetric caption bands).

---
'@glissade/scene': minor
'@glissade/narrate': minor
---

**0.64.0 — `safeAreas` + `CAPTION_COLLISION`: reserved caption-band verification.** A reserved region (e.g. the bottom caption band) is a *fill-zone* for its owner (the caption) and a *forbidden-zone* for everything else. One `SafeArea` primitive + a band-aware check closes three real-content needs — and it is a CRITIQUE concern only, never a render input, so every rendered byte is unchanged.

- **`SafeArea = { bounds: Region; owner? }`** on `CritiqueOptions.safeAreas?` (inherited by `assess`). Reuses the existing `Region {minX,minY,maxX,maxY}` (integer-px bounds → deterministic, no diagnostic flicker). `owner` is subtree-matched — the owner node and its descendants are fill-allowed.
- **`CAPTION_COLLISION`** (new critique diagnostic) — a *non-owner* node whose bounds intersect a reserved region (foreground art dipping into the caption band). A pure DisplayList bounds∩region read, like `OFF_CANVAS`/`OCCLUSION`; fix lever `position` (move above the band).
- **Caption-too-tall reuses `TEXT_OVERFLOW`** — a Text node that *owns* a SafeArea gets that region as its critique-only effective height-box (never a render `box.h`), so the existing height-overflow + `minLegiblePx` machinery fires: shrink-to-fit if legible, else escalate the content decision. No duplicated overflow logic; inherits the meaning-veto.
- **Resize-feasibility reads the regions** — `assess`'s box-grow lever is infeasible if the grown box would intersect a region the node doesn't own → escalates.
- **`captionSafeArea(size, { owner? })`** (`@glissade/narrate`) — the authoritative band derived from `captionNode`'s own layout, integer-pinned. Its default `owner` and `captionNode`'s default `id` are the same exported `CAPTION_NODE_ID`, so `[captionSafeArea(size)]` can't self-collide; the `owner` override tracks a renamed caption.
- **`describe().types`** — a structured-type registry (`Region`, `SafeArea` field shapes) so a no-build agent can construct a valid `SafeArea`; `safeAreas` joins the `assess`/`critique` options-schema.

Additive + render-neutral: all 415 goldens byte-identical, base embed unchanged (38.67/39), determinism `b4e6060006` intact. Unblocks the deferred safeArea resize-feasibility.

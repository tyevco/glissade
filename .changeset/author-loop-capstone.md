---
'@glissade/scene': minor
---

**0.63 the closed-author-loop capstone** — composes the whole verification suite (validateScene + critique + parity + diff + certify) into the author→render→critique→self-fix cycle. The framework owns the *verdict*; the agent owns the *fix*.

- **`assess(scene, timeline, opts?) → { clean, diagnostics[], fixable, escalated, accepted, certKey, signature }`** (on `@glissade/scene/diagnostics` + the `window.glissade` IIFE, `kind:'tool'`) — one composed verdict: critique (which runs validateScene → the rendered pass), exportFidelity (when `exportBound`), a diff blast-radius (when a `previous` state is given), and certKey — unified, deduped, prioritized. `clean` means no error and no geometry-fixable warning remains. This is the single call an agent drives the loop from.
- **Per-lever `fixHints` with `fixClass: 'geometry' | 'content'`** — the meaning-preservation veto. A diagnostic offers multiple levers of different classes (TEXT_OVERFLOW: fontSize/width are geometry, "shorten text" is content); `assess()` partitions into `fixable` (a geometry lever exists → an agent may auto-apply) vs `escalated` (all levers content → a human decides). Geometry is auto-fixable; content is never auto-applied.
- **`accept`** (scoped-intent, subtree-matched like `offstage`) — a knowingly-accepted diagnostic (a deliberate render-only drop, a brand contrast) leaves the fixable set so the loop can converge.
- **`describe().recipes` + `recipe(name, props) → fragment`** — a registry of whole-scene scaffolds (lower-third, title-card, stat-reveal, cold-open) an agent discovers like it discovers nodes; every recipe validates `assess()`-clean at default props, so the loop starts near-clean.
- **`docs/authoring-loop.md`** + a runnable example — the agent-driven loop (author → assess → auto-apply a geometry lever → re-assess until clean-of-fixable or no-progress convergence), and the boundary: the loop closes the mechanical class unattended; a human owns meaning, truth, and aesthetic.

Additive/pure-read: all 415 goldens byte-identical, base embed unchanged (38.67/39), determinism b4e6060006 unbroken 0.20→0.63. The loop composes determinism-guarded primitives and terminates in a certificate — the invisible moat, composed into an author→verify→certify product.

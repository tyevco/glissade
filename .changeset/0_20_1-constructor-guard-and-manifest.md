---
'@glissade/scene': patch
'@glissade/browser': patch
---

0.20.1: fail-loud node constructors + splitText manifest/guard fixes (browser-canary findings)

- **Node constructors now THROW on an unknown prop key** (`NodeConstructionError`) instead of silently dropping it — the construction-time sibling of the timeline builder's unknown-option guard. `new Rect({ size: [80, 80] })` (no such prop — Rect has `width`/`height`) used to leave a 0×0 invisible node with no warning (the browser guide even shipped that example); it now fails loud, naming the bad key, the node type, and the valid props. The allow-list is derived from the live `registerTarget` set + the construction-prop name sets (so it can't drift from what constructors honor); animatable dotted sub-paths like `position.x` stay timeline-only targets and are correctly rejected as constructor keys. Built-in nodes only — `Custom`/user subclasses (whose `new.target` matches no built-in) are never validated, keeping that extension seam lenient.
- **`describe()` now describes `splitText` accurately** — the real object return shape `{ node, children, parts, targets }` (was `Node[]`), the real `by` enum `'word' | 'line' | 'grapheme'` (was `'word' | 'char'`), and the `id`/`measurer` opts (the latter is the documented escape hatch from the estimating-measurer footgun).
- **`splitText` throws on an unknown `by`** instead of silently treating it as `grapheme` (the same fail-loud class).
- **Docs:** the broken `new G.Rect({ size: [80, 80] })` examples in `docs/browser.md` (3×) and `docs/discovery.md` → `width`/`height` (doubly required — under the guard the old example would otherwise throw).

Determinism preserved: the guard is construction-time / error-path, off the render path — all 262 goldens byte-identical. Base embed 35.62 → 36.00/39 (+0.38, well under ceiling); browser IIFE budget 48 → 49 (convenience bundle).

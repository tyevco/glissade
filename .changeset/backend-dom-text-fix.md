---
'@glissade/backend-dom': patch
---

0.21: backend-dom — fix DOM text positioning (alignment + baseline)

The DOM backend rendered text noticeably misplaced versus the canvas tier. Two fixes:

- **Alignment:** a shrink-wrapped text `<div>` is left-anchored, so CSS `text-align` did nothing — centered/right text was shifted right by half/all of its width. Alignment now maps to a `translateX` of the text's own width (`center` → −50%, `right` → −100%), matching canvas `textAlign` anchoring around `x`.
- **Baseline:** `line-height: 1` keeps the baseline a predictable ~0.8em below the box top; the font is now set via longhand properties (so the `font` shorthand no longer resets that line-height).

Preview/non-parity is unchanged structurally; the canvas/Skia path is untouched (all 262 goldens byte-identical).

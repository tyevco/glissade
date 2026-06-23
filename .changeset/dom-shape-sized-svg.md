---
'@glissade/backend-dom': patch
---

backend-dom: size each shape's `<svg>` to its bounding box (not full-canvas)

Every `fillPath`/`strokePath` previously rendered as a full viewport-sized (e.g. 1920×1080) `<svg>` with the shape painted inside — so an 800×96 bubble lived in a canvas-sized box. Stacked, those giant transparent boxes overlapped every other node, made the DOM tree read as "huge/unstructured," and swallowed clicks meant for shapes behind them (breaking the editable-DOM tier's hit-testing).

Each geometry island is now sized **tightly to its path's bounding box** via the SVG `viewBox`, so the painted coordinates are unchanged (1:1 mapping — the render is pixel-identical) while the element box shrinks to the shape. The island is `pointer-events:none` (its transparent area is click-through) and the painted path re-enables hit-testing, so `el.closest('[data-node-id]')` resolves to the shape actually under the pointer. Strokes pad the box by their width; `overflow:visible` covers any curve/miter overshoot.

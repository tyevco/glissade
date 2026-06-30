---
'@glissade/scene': minor
---

scene: `measureWrappedText` — size a container to wrapped text without a Text node

Sizing a bubble/card to *wrapped* text previously meant re-implementing line-breaking consumer-side. `Text.measuredSize`/`lineBoxes` already cover a Text *node*; the new `measureWrappedText` covers a raw *string*:

```js
const { width, lines, height, ascent, descent } = scene.measureWrappedText(text, font, width, lineHeight /* = 1.25 */);
```

It reuses the renderer's own `breakLines` + measurer (the exact `Text.intrinsicSize` steps), so the line breaks match what gets drawn. Also exported standalone as `measureWrappedText(text, font, width, lineHeight, measurer)`, and surfaced in `describe()` (pointing at the Text-node analogue). `width <= 0` = no wrap (explicit `\n` still breaks).

---
'@glissade/backend-dom': patch
---

backend-dom: `onReflow` — re-wrap text when web fonts finish loading

Text wrapping is computed upstream in the scene from this backend's `measureText`, so a caption first measured before its web font loaded wraps on the fallback-font estimate and can render unwrapped at first paint. `DomBackend` now accepts an `onReflow` option:

```js
const backend = new DomBackend(stage, { onReflow: () => frame(currentTime) });
```

It fires when `document.fonts` becomes ready (and on later lazy `@font-face` batches), so the host re-evaluates and text re-wraps with the loaded font. Passive-sink contract preserved — the backend signals, the host re-renders. No-op where `document.fonts` is absent (e.g. jsdom).

---
'@glissade/core': patch
---

`parseCmap` now accepts an `ArrayBuffer | ArrayBufferView` (e.g. a `Uint8Array`/`Buffer` from `readFileSync`), not just an `ArrayBuffer`. Previously a typed-array view made the internal `new DataView(bytes)` throw, swallowed to an empty coverage set — a silent wrong answer for the most natural input type. (0.9 canary nit.)

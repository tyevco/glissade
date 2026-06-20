---
'@glissade/core': patch
---

Fix `registerFont`/`ingestFont` throwing `Unrecognized font signature` on a woff2/woff passed as a plain `Uint8Array` or `ArrayBuffer` `src` (i.e. every real consumer — `registerFont` normalizes `src` to a plain `Uint8Array`). `fontverter@2.x` sniffs the magic via `Buffer.prototype.toString('ascii',0,4)`, which a plain `Uint8Array` does not honor; the decode now normalizes to a node `Buffer` first. The in-repo woff2 test masked this by feeding a path (→ `readFile` → a `Buffer`); added a regression that ingests a plain `Uint8Array`/`ArrayBuffer` src — the broken public-API contract. (ai-training real-Fontsource validation, the second woff2 bug behind DsW-aD_OUMoV item 1.)

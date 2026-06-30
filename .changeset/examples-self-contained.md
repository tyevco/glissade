---
'@glissade/scene': patch
---

scene: example snippets are now self-contained (copy-paste safe) + a doctest guard

Two corpus snippets (`Stack`, `Grid`) used `new Rect(...)` in their `children` without importing `Rect`, so a copy-paste threw `ReferenceError` — in npm and no-build alike (found by the canary seats). Root cause: the doctest ran the `run` thunk (which had `Rect` in scope) but never checked the displayed `code` string was self-contained. Fixed both snippets, and added a doctest assertion that every example's `code` imports every glissade identifier it uses — so the `code`-vs-`run` divergence class can't recur (the displayed snippet is the product). The generated API reference also notes the IIFE adaptation (`import { X }` → `const { X } = window.glissade`).

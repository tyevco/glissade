---
"@glissade/player": minor
---

0.20: `mount({ backend })` injection seam (S3 foundation, Canvas2DBackend default — DOM-backend readiness)

`mount()` now accepts an optional `PlayerOptions.backend` factory `(target) => RenderBackend`. When supplied, mount drives the injected backend; when omitted it defaults to `new Canvas2DBackend(target)` exactly as before — so every existing call site is byte-for-byte unchanged, all 262 goldens stay byte-identical, and player gains no new static backend dependency (the abstract `RenderBackend` contract is injected by the caller above player). `Mounted.backend` widens from `Canvas2DBackend` to `RenderBackend`. This is the single explicit seam a future `@glissade/backend-dom` plugs into without forking the mount body (dom-backend memo, Seam 2 / staged-path S3 foundation).

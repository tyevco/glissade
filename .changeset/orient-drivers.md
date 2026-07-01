---
"@glissade/scene": minor
---

Motion-craft quick-win: `orientToPath` + `lookAt` orientation drivers (`@glissade/scene/motion`)

Two rotation-only companion nodes — the pure-model siblings of `followPath`. Each owns only its target's `rotation` via pull-based binding, so it composes with whatever drives position (keyframes, layout, a separate `followPath`). Tree-shakeable off the base embed; also on the browser IIFE (`window.glissade.orientToPath` / `.lookAt`).

- **`orientToPath(target, path, { progress?, offset? })`** — banks a node to the path tangent at `progress` (the rotation half of `followPath`'s `orient`, usable when position comes from elsewhere).
- **`lookAt(target, at, { offset? })`** — aims `target`'s local +x axis at another node's world origin (a turret tracking a mover). Reads the aimed node's world position through its parent matrix, and computes its own origin the same way, so there is no `rotation → worldMatrix → rotation` cycle.

Both are pure functions of the signal graph — determinism and the golden corpus are unchanged (all existing goldens byte-identical; a new `orient` golden + showcase scene added).

```js
import { orientToPath, lookAt } from '@glissade/scene/motion';
orientToPath(rocket, track, { id: 'bank', progress: 0.5 }); // drive 'bank/progress'
lookAt(turret, rocket); // turret always faces the rocket
```

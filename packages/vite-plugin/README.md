# @glissade/vite-plugin

Dev-server middleware for the studio's persistence: `GET/POST /__glissade/sidecar?scene=…` reads and writes per-scene `*.edits.json` sidecars (editor-owned keyframes merged over the code baseline), and `GET/POST /__glissade/project` serves `glissade.project.json` (shared markers + render presets). Writes are path-confined to the project root.

```sh
npm i -D @glissade/vite-plugin
```

```ts
// vite.config.ts
import { glissade } from '@glissade/vite-plugin';
export default { plugins: [glissade()] };
```

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

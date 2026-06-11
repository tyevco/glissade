# @glissade/export-web

In-browser export: WebCodecs encoding + Mediabunny muxing, frame-accurate and faster than realtime, with sample-accurate audio via OfflineAudioContext. Ships the **worker protocol** (`serveExportRequest` / `requestWorkerExport`) so encoding runs off the main thread — audio premixes main-side and transfers as raw PCM. Codec support is feature-detected; PNG frames are the unconditional fallback.

```sh
npm i @glissade/export-web
```

```ts
import { exportVideo } from '@glissade/export-web';

const { blob, format } = await exportVideo(scene, doc, { fps: 60, format: 'auto' });
```

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.

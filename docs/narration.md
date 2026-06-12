# Narration & captions

`@glissade/narrate` adds TTS narration and captions without breaking the core contract: **render is a pure, offline function of committed files**. Provider calls (cloud or local) happen only in an explicit prepare step — `gs narrate` — whose outputs (audio + a timing manifest) are committable JSON and WAV. After that, `gs render` works on a plane.

## The flow

```
scene.narration.json   ── gs narrate ──▶  scene.narration-cache/*.wav
   (you write this)                       scene.narration.timing.json
                                              (committed, drives everything)
```

1. Write a narration script next to your scene module:

```json
// my-scene.narration.json
{
  "narrationVersion": 1,
  "provider": "espeak",
  "gap": 0.35,
  "leadIn": 0.25,
  "segments": [
    { "id": "intro", "text": "Welcome to glissade." },
    { "id": "data", "text": "Captions are data." }
  ]
}
```

2. Synthesize (the only step that touches a provider):

```sh
gs narrate my-scene.ts                  # uses the script's provider
gs narrate my-scene.ts --provider fake  # deterministic sine — CI, tests
gs narrate my-scene.ts --force          # ignore the cache, redo everything
```

Each segment is cached by `sha256(text, voice, rate, provider, providerVersion)` — editing one segment's text re-synthesizes **only that segment**, and every later segment's start time re-flows automatically.

Providers: `espeak` (local/offline, needs `espeak-ng` on PATH), `openai` (cloud, `OPENAI_API_KEY`), `fake` (pure function of the text — what CI and the golden corpus use). The `TtsProvider` interface is three members; bring your own.

## Anchors: beats addressed by narration

Hand-timing visuals to a voice track is misery — and breaks the moment you re-record. Anchor them instead:

```ts
import { narration, type NarrationTiming } from '@glissade/narrate';
import timingJson from './my-scene.narration.timing.json';

const beats = narration(timingJson as NarrationTiming);

track('panel/opacity', 'number', [
  key(beats.start('intro'), 0),
  key(beats.start('intro') + 0.3, 1, 'easeOutCubic'),
]),
```

`beats.clips('./my-scene.narration-cache')` returns ordinary `AudioClip[]` for the timeline's `audio` array — the existing FFmpeg mix machinery does the rest. `beats.labels()` exposes `intro.start` / `intro.end` as timeline labels.

Re-narrate with different durations and every anchored beat re-flows. Nothing else changes.

## Captions are tracks

A caption is a **string track with hold keys** plus a styled `Text` node — plain document data, so it lives in the timeline JSON, evaluates deterministically, and golden-frame CI covers it like any other pixel:

```ts
import { captionNode, captionTrack } from '@glissade/narrate';

createScene({
  size: SIZE,
  children: [...yourNodes, captionNode(SIZE, { fontFamily: 'DejaVu Sans' })],
});

timeline({
  tracks: [captionTrack(timing), ...yourTracks],
  audio: beats.clips('./my-scene.narration-cache'),
});
```

`captionNode` places bottom-centered text inside the platform safe area — and detects portrait scenes (9:16 cutdowns live under reels/shorts UI chrome), sitting captions higher with a proportionally smaller face. Both aspect ratios are in the golden corpus.

## Render modes & sidecars

```sh
gs render my-scene.ts --out video.mp4                     # burn (default)
gs render my-scene.ts --out video.mp4 --captions sidecar  # clean frames + .srt/.vtt
gs render my-scene.ts --out video.mp4 --captions off      # neither
```

`burn` and `sidecar` both write `video.srt` and `video.vtt` next to the output; the cues come from the same timing manifest as the burned track, so they match by construction. Hiding captions is a *document* operation — an override track zeroing `captions/opacity`, merged over the scene doc — never a scene-graph mutation.

## Determinism

- `gs render` never contacts a provider; with committed narration artifacts it runs fully offline, byte-stable across runs.
- The `fake` provider is a pure function of the request, so narration fixtures in the repo regenerate identically on any machine.
- Word-level timestamps land in the manifest when the provider supplies them (`segments[].words`) — segment-level is the v1 caption granularity; word-level karaoke highlighting is the reserved next step.

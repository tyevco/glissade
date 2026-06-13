# Music & the beat grid

The tempo sibling of the [narration manifest](/narration): a committed `*.music.timing.json` next to its stem, `music(timing)` anchors so signature animations land on the grid, and render-time auto-mix with automatic ducking under narration. The shape comes from downstream production (a TidalCycles render pipeline) and is blessed here so the ecosystem converges.

## The manifest

```json
// pipeline-test.music.timing.json — next to its stem
{
  "musicVersion": 1,
  "name": "pipeline-test",
  "bpm": 96,
  "beatsPerCycle": 4,
  "cycles": 8,
  "cps": 0.4,
  "durationSec": 20.0,
  "offsetSec": 0,
  "stem": "pipeline-test.wav",
  "gainDb": -6,
  "source": "music/patterns/pipeline-test.tidal"
}
```

The load-bearing invariant: **beat 0 is sample 0 of the stem.** Your prepare step trims the recording to the downbeat and cuts to exact musical length — then everything derives from `bpm`/`beatsPerCycle`, no per-beat marker arrays. `offsetSec` exists for stems that can't be trimmed (count-ins). `cps` is TidalCycles-native and redundant with bpm — when present it's validated against `bpm / (60 · beatsPerCycle)`. `stem` (relative to the manifest) enables render auto-mix; `gainDb` is the bed level.

## Anchors

`music(timing, at)` mirrors `narration(timing)` — pure functions over the committed manifest:

```ts
import { music, type MusicTiming } from '@glissade/narrate';
import timingJson from './pipeline-test.music.timing.json';

const m = music(timingJson as MusicTiming);

// springs that SETTLE on the beat — springTo does the duration arithmetic
track('card/position.y', 'number', [...springTo(m.beat(4 + i * 2), fromY, restY, settle)]),

m.beat(8);          // timeline second of beat 8
m.cycle(2);         // beat 8 again, at 4 beats/cycle
m.nextBeat(t);      // quantize forward — "after X finishes, on the grid"
m.nearestBeat(t);   // snap either way
```

`m.clip(url?, opts?)` returns the stem as an ordinary `AudioClip`, with the bed level and ducking composed:

```ts
timeline({
  audio: [
    ...beats.clips('./scene.narration-cache'),
    m.clip(undefined, { gainDb: -6, duckUnder: narrationTiming, duckOpts: { duck: 0.2 } }),
  ],
});
```

The whole envelope (duck windows included) scales by `10^(gainDb/20)`, so `duck: 0.2` stays relative to the bed level. `opts.gainDb` **overrides** the manifest's `gainDb` (it does not compose) — one bed level wins.

Auto-mix never double-adds: if the timeline's `audio` array already references the stem (any url spelling resolving to the same file), `gs render` skips the bed with a note — a coherent duplicate would be +6dB.

## Zero-config auto-mix

`gs render` auto-mixes **both** sibling manifests — the narration voice (`<scene>.narration.timing.json`) and the music bed (`<scene>.music.timing.json` with a `stem`), the bed auto-ducked under the voice:

```
scene.ts
scene.narration.timing.json    ← gs narrate output
scene.music.timing.json        ← your music prepare step
bed.wav                        ← the stem
```

```sh
gs render scene.ts --out video.mp4               # voice + ducked bed, one command
gs render scene.ts --out video.mp4 --music off   # voice only
gs render scene.ts --out video.mp4 --narration off --music off   # silent
```

That's the full narrated-explainer-with-bed pipeline with no mixing configuration at all: narration clips from the narration manifest, bed level from `gainDb`, duck windows from the narration segments. You can still wire `timeline.audio` by hand (and must, for browser export — see [narration](/narration)); `gs render` detects what's already wired and never double-mixes it.

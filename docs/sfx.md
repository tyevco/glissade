# Sound effects

`@glissade/sfx` adds clicks, pops, whooshes and UI blips without breaking two rules glissade cares about: **determinism** (the same document renders byte-identical audio) and **license cleanliness** (nothing that ships in a monetized video is of uncertain provenance).

It does that with a **clean-room procedural synth** — no third-party synth code, no `Math.random` — so every bundled effect is unambiguously yours to use.

## Procedural voices

`sfxrSource()` is a bank of ten built-in presets:

```
click  tap  pop  whoosh  success  error  type  select  coin  blip
```

Each renders from a small fixed param set (`SfxrParams`: waveform + attack/sustain/decay + pitch slide + an optional one-shot arpeggio). The render is a pure function of the params — `renderSfxr(params)` returns byte-identical Int16 PCM on any machine (the noise voice draws from core's seeded `random`, never `Math.random`), quantized to Int16 last, which is the determinism boundary.

```ts
import { sfxrSource, renderSfxAssets } from '@glissade/sfx';

const sfx = sfxrSource();
sfx.voices(); // [{ id: 'click' }, { id: 'tap' }, …]
```

## Placing effects

A hit is a voice at a timeline second — hang it on a narration beat or a pause so it survives a re-record:

```ts
import { buildSfxClips, type SfxHit } from '@glissade/sfx';
import { narration } from '@glissade/narrate';

const beats = narration(timing);
const hits: SfxHit[] = [
  { voice: 'pop', at: beats.start('reveal') },
  { voice: 'success', at: beats.at('beat', 0.2) }, // 0.2s into a pause window
];

timeline({
  audio: buildSfxClips(hits, sfx, { baseUrl: './sfx-cache', seed: 7, jitterRate: 0.06 }),
  tracks: [...],
});
```

`buildSfxClips` returns ordinary `AudioClip[]` for the timeline's `audio` array — the existing FFmpeg mix machinery does the rest. Each clip points at the committed WAV (`renderSfxAssets(sfx, voices)` writes them, deduped by voice; filenames match the clip URLs by construction).

### Variation without breaking determinism

Repeated identical hits sound machine-gun fake. `jitterRate` / `jitterGain` add per-hit pitch and level variation — but **index-seeded**, from `random(seed ^ hash(source/voice) ^ index)`, so it's a pure function of position: identical inputs yield identical clips, and re-evaluating the timeline out of order never drifts. `±0.06` is a natural keystroke/coin spread.

## Sample packs (license-checked)

To use recorded samples instead of (or alongside) the synth, wrap them in a pack — `license` and `source` are **mandatory** and validated at construction (a hard throw, the same discipline as the music manifest):

```ts
import { samplePackSource } from '@glissade/sfx';

const kit = samplePackSource({
  id: 'ui-kit',
  license: 'CC0-1.0',
  source: 'freesound.org/people/.../packs/12345',
  samples: { kick: kickWavBytes, snap: snapWavBytes },
});
```

A pack missing its license or provenance throws — unlicensed audio never ships by omission.

## Determinism

`renderSfxr`, `buildSfxClips`, and the jitter are pure functions — no clock, no ambient randomness. Committed WAVs + the timeline document are the reproducibility boundary, exactly like narration and music: `gs render` contacts nothing and produces byte-stable audio.

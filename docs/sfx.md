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

## Keystroke sync

`keystrokeClips(marks, source)` is the typewriter's audio half — one click per typed (or deleted) character. It consumes the schedule from [`typewriter()`](/typewriter#deletion-type-delete-retype) (`EditMark[]`, with backspaces) or a monotonic `revealSchedule()`:

```ts
import { keystrokeClips } from '@glissade/sfx';
import { typewriter } from '@glissade/scene';

const tw = typewriter('prompt/text', [{ type: 'make it pop' }, { delete: 3 }, { type: 'sing' }]);

timeline({
  tracks: [tw.track],
  audio: keystrokeClips(tw.marks, sfxrSource(), { seed: 9, jitterRate: 0.05, deleteVoice: 'tap' }),
});
```

Whitespace is skipped by default, a backspace can take a distinct `deleteVoice`, and the per-key variation is index-seeded — so the typing track stays alive instead of machine-gun identical. The `marks` are neutral data; the policy (which sample, what to skip) lives here.

### Real keyboard foley

A genuine mechanical-keyboard pack rotates several keypress recordings so the typing doesn't sound looped. Pass a pool to `insertVoices` (and `deleteVoices`) and `keystrokeClips` round-robins it with an index-seeded pick — deterministic, never the same loop. Bring the pack in with [`samplePackSource`](#sample-packs-license-checked):

```ts
const keys = samplePackSource({
  id: 'mech-keys', license: 'CC0-1.0', source: 'freesound.org/.../packs/45678',
  samples: { k1, k2, k3, back },          // Uint8Array WAV bytes
});
// write the cache the clip urls resolve against
for (const [f, bytes] of Object.entries(renderSfxAssets(keys, ['k1','k2','k3','back'])))
  writeFileSync(`./sfx-cache/${f}`, bytes);

const audio = keystrokeClips(tw.marks, keys, {
  baseUrl: './sfx-cache',
  insertVoices: ['k1', 'k2', 'k3'],       // round-robin the keypresses
  deleteVoice: 'back',
  jitterRate: 0.04,                        // a touch of pitch variation on top
});
```

## Zero-config: the `gs sfx` prepare step

Like narration and music, effects have an explicit prepare step so `gs render` stays a pure read of committed files. Write a `<scene>.sfx.json` next to the module — hits can anchor to a **narration beat** (resolved against the sibling `*.narration.timing.json`, so they re-flow when you re-narrate) or use an absolute `at`:

```json
// my-scene.sfx.json
{
  "sfxVersion": 1,
  "source": "sfxr",
  "seed": 7,
  "jitterRate": 0.06,
  "hits": [
    { "voice": "pop",     "anchor": "reveal" },
    { "voice": "success", "anchor": "beat", "offset": 0.2 },
    { "voice": "click",   "at": 4.5, "gain": 0.6 }
  ]
}
```

```sh
gs sfx my-scene.ts     # resolve anchors, render the WAV cache, commit the timing manifest
gs render my-scene.ts  # auto-mixes the sibling *.sfx.timing.json — zero config (--sfx off opts out)
```

`gs sfx` resolves each hit's time, renders the referenced voices once (deduped) into `my-scene.sfx-cache/`, **bakes the index-seeded jitter into the committed `my-scene.sfx.timing.json`**, and that manifest is what `gs render` mixes — exactly the narration/music pattern, including the double-add guard (author-wired clips are detected and never doubled). Re-run `gs sfx` after editing the script or re-narrating, and the times re-flow.

A hit needs exactly one of `anchor` or `at`; an unknown voice or an anchor with no narration manifest fails loudly. (v1 of `gs sfx` drives the procedural `sfxr` source; sample packs are available from code via `buildSfxClips`.)

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

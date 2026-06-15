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
gs narrate my-scene.ts                    # uses the script's provider
gs narrate my-scene.ts --provider piper   # local neural voice
gs narrate my-scene.ts --align vosk       # real word timings (re-aligns cached audio)
gs narrate my-scene.ts --force            # ignore the cache, redo everything
```

Each segment is cached by `sha256(text, voice, rate, provider, providerVersion)` — editing one segment's text re-synthesizes **only that segment**, and every later segment's start time re-flows automatically.

## Voices (providers)

| Provider | Where | Quality | Native word timings | Needs |
| --- | --- | --- | --- | --- |
| `fake` | local, pure JS | a tone | yes (synthetic) | nothing — CI, tests, previews |
| `espeak` | local, offline | robotic | no | `espeak-ng` on PATH |
| `piper` | local, offline | **natural** (neural) | no | a `.onnx` voice model ([rhasspy/piper](https://github.com/rhasspy/piper)) |
| `openai` | cloud | natural | no | `OPENAI_API_KEY` (`gpt-4o-mini-tts`) |

`piper` needs a voice model: pass it as `--provider piper` with the model path in the script's `voice` (per-segment or top-level), or construct `piperProvider({ model })`. Most providers emit **no word timings** — the [alignment step](#word-timing-alignment) fills those in.

Piper is **deterministic by default**: VITS adds noise (generator + a stochastic duration predictor), so vanilla piper re-synthesizes the same text to slightly different audio/durations — which would re-pin any goldens anchored to narration timing. glissade zeroes both noise scales so re-synthesis is **byte-identical**. For piper's more natural (but drifting) prosody, opt out with its native defaults and wire via `providerImpl`:

```ts
synthesizeScript(script, { providerImpl: piperProvider({ model, noiseScale: 0.667, noiseWScale: 0.8 }) });
```

The noise mode is part of the provider version, so switching deterministic↔natural invalidates the cache and re-synthesizes. (Either way, the committed manifest + cache is the practical determinism boundary — don't re-narrate unless the script changes.)

The `TtsProvider` interface is three members (`id`, `version()`, `synthesize()`) — bring your own (ElevenLabs, Azure, Polly…) and pass the instance via `synthesizeScript({ providerImpl })`; a provider that returns `words` skips alignment entirely.

## Word timing & alignment {#word-timing-alignment}

Captions are segment-level, but word-synced highlights (`wordBoxes()` + `tokenHighlight`) need per-word timing — and most providers don't emit it. So timing is a separate, **provider-independent** step:

```
synthesize (any provider)  →  wav  (+ words, if the provider gives them)
        │
        ├─ words present? ── yes ──▶ use them          (ElevenLabs/Azure-style)
        │
        └─ no ──▶ align(wav, text)  →  words           (the --align step)
```

Aligners (`--align <id>`, or the script's `align` field; default `heuristic`):

| Aligner | How | Accuracy | Needs |
| --- | --- | --- | --- |
| `heuristic` | spreads words over the clip by syllable estimate | rough, deterministic | nothing (always available) |
| `vosk` | offline ASR, word timestamps from the audio | real | a `vosk-align` command (Apache-2.0 Vosk + ffmpeg; ~40 MB model) |
| `none` | — | — | leaves segments word-less |

The default `heuristic` means word timings **always exist** — fine for captions; karaoke on a very fast or slow word wants a real aligner. Provider-supplied words always win over alignment.

`vosk` is the chosen real aligner because it clears the bar that ruled out the alternatives — **Apache-2.0** (code *and* the ~40 MB model, vs the multi-GB / CC-BY-NC wav2vec2/Whisper options), and offline. glissade **shells out to a `vosk-align` command** rather than the npm `vosk` package (whose `ffi-napi` native build is broken on modern Node). The command reads any audio (ffmpeg-decoded) and writes word JSON to stdout:

```sh
vosk-align speech.wav   # → { "words": [ { "word", "start", "end", "conf" }, … ] }
```

Point glissade at it via `VOSK_ALIGN` (default `vosk-align`); the model is the command's own concern (its default or `VOSK_MODEL`). The cleanest setup is the Python `vosk` binding + ffmpeg wrapped as `vosk-align` (e.g. via a Nix flake); any command honoring that stdout contract works.

```sh
gs narrate my-scene.ts --align vosk
```

Vosk transcribes, and `mapAsrToScript` fits its words onto your *script* tokens (`segments[].words[i]` lines up with `wordBoxes()[i]`), interpolating any the recognizer missed — a number spelled out, or an unknown proper noun, lands accurately between the words around it. (Verified: a synthesized "glissade" that Vosk hears as "glue glyphosate" still gets a sensible interpolated span while its neighbours keep exact timing.)

Two properties worth knowing:

- **Alignment runs only in `gs narrate`** — heavy work is acceptable because it runs once and the result is cached, exactly like synthesis. Render never sees it.
- **Swapping aligners re-aligns the cached wav, not the TTS.** `gs narrate scene.ts --align vosk` after a `heuristic` run re-derives words from the committed audio at **zero synthesis cost** — the cache records which aligner produced each segment's words (`wordsFrom`) and only re-runs when it changed.

Other forced aligners — the Montreal Forced Aligner (conda, gold-standard, multilingual TextGrids) or whisper.cpp (a C++ binary, no Python) — slot in the same way: the `Aligner` interface is three members (`id`, `version()`, `align({ wav, text })`), and `mapAsrToScript` is exported to map their output onto your script tokens. Pass your instance via `synthesizeScript({ alignerImpl })`.

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

**You can omit `audio: beats.clips(...)` for `gs render`** — it auto-mixes a sibling `*.narration.timing.json` (so scene + narration manifest → a voiced mp4, zero-config; `--narration off` opts out). Wire `beats.clips()` explicitly when you want the voice in **browser export** (which mixes only `timeline.audio`, no manifest discovery) or to control clip order/gain; `gs render` detects what's already wired and never double-mixes it.

Re-narrate with different durations and every anchored beat re-flows. Nothing else changes.

## Pacing: pause beats

The hardest part of narration timing is the **silence** — the dramatic beats where nothing is said. Hand-timing them breaks the moment you re-record. So make a pause a first-class, named element of the script:

```json
{
  "narrationVersion": 1,
  "provider": "piper",
  "segments": [
    { "id": "claim", "text": "Render is a pure function of time." },
    { "pause": 0.8, "id": "beat", "bed": "swell" },
    { "id": "payoff", "text": "So every frame is addressable." }
  ]
}
```

A pause is an **addressable window**, not just dead air. It produces the same anchors a segment does — `beats.start('beat')`, `beats.end('beat')`, `beats.duration('beat')` — and `beats.at('beat', 0.3)` is a sub-beat 0.3s into the window. Hang a visual (or an SFX) on it and it survives a re-record: a pause supplies its own silence (suppressing the default inter-segment `gap` around it) and shifts every later segment's start, so the whole track re-flows. `beats.labels()` exposes `beat.start` / `beat.end` for studio visibility; captions clear automatically across the pause.

The optional **`bed`** controls what the music bed does across the window (it feeds [`duckEnvelope`](#ducking-the-music-bed)):

| `bed` | The bed… | For |
| --- | --- | --- |
| `hold` (default) | stays ducked through the pause — no swell | a beat mid-thought, no jarring music bump |
| `silence` | cuts to a floor (default 0; `{ silence }` to set it) | a hard dramatic cut |
| `swell` | breathes back up to base while the voice rests | letting the music land before the next line |

Pauses are pure manifest data, so the ducking, the anchors, and the caption clears all re-derive from the committed file — no clock, golden-stable.

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

**Long segments can stay in-frame — opt in with `{ autoFit: true }`.** A long caption otherwise wraps to many lines and runs off the bottom — fatal for muted 9:16 cutdowns where burned captions are load-bearing. With `autoFit`, `captionNode` guards both ends, deterministically: it **auto-shrinks** the font until the wrap fits `maxLines` (default 2; floored at `minScale`, default 0.7× the base size), and **bottom-anchors** the block so extra lines grow *upward* into the safe area instead of off the edge.

```ts
captionNode(SIZE, { autoFit: true, maxLines: 3 }); // recommended for 9:16 cutdowns
```

It's **off by default** — enabling it re-flows multi-line burned captions, so it's an explicit opt-in (existing scenes render byte-identically without it).

For cues too long to fit even the floor, **split** the segment into timed sub-cues instead of shrinking. Add `captionSplit` to the script — it's persisted into the timing manifest, so the burned track and the `.srt`/`.vtt` sidecars split at exactly the same boundaries:

```json
// my-scene.narration.json
{ "narrationVersion": 1, "captionSplit": { "maxChars": 32 }, "segments": [ … ] }
```

`captionTrack`, `toSrt`, and `toVtt` all call the same `splitCaption(segment, maxChars)` — chunking on word boundaries and timing each sub-cue from its first word (per-word alignment). When a segment has **no** per-word timings, it falls back to dividing the segment window **evenly by sub-cue count** (not weighted by each cue's text length) — so prefer an aligner that emits word timings (`gs narrate --align heuristic` gives them) for tighter sub-cue timing. Omit `captionSplit` for no split (the default, byte-identical).

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
- Word-level timestamps (`segments[].words`) come from the provider when it emits them, otherwise from the [alignment step](#word-timing-alignment) — both run once in `gs narrate`, are committed, and are cached. Cloud TTS isn't byte-stable call-to-call, but the cache key prevents re-synthesis, so the committed manifest stays reproducible.

## Karaoke (word-synced highlights)

`Text.wordBoxes()` + the manifest's word timestamps make word-level sync pure data — geometry from the text, timing from the narration, one hold-key track joining them:

```ts
const seg = timing.segments.find((s) => s.id === 'intro')!;
const line = new Text({ id: 'line', text: seg.text, fontFamily: 'DejaVu Sans', fontSize: 24 });
const boxes = () => line.wordBoxes(); // index-aligned with seg.words

// a marker that jumps word-to-word on the narration's clock
const marker = new Rect({ id: 'marker', anchor: 'left', height: 30, fill: '#ffd83d', blend: 'multiply' });
marker.position.bindSource(() => {
  const i = wordIndex(); // animate 'idx/width' below
  const b = boxes()[Math.min(i, boxes().length - 1)]!;
  return [b.x - 2, b.y + b.h / 2];
});
marker.width.bindSource(() => boxes()[Math.min(wordIndex(), boxes().length - 1)]!.w + 4);

// hold keys at each word's start time, straight from the manifest
track('idx/width', 'number', seg.words!.map((w, i) => key(w.start, i, { interp: 'hold' })));
```

For a sweeping (rather than jumping) karaoke marker, drive `highlight()`'s `progress` with keys at word starts instead, valued at each word's cumulative width share.

## Ducking the music bed

`duckEnvelope(timing, opts)` derives the bed-ducking gain from the narration manifest — duck windows are the segments, with attack/release ramps and near-window merging (no pumping between close segments). Re-narrate and the ducking re-flows:

```ts
const bed: AudioClip = {
  asset: { kind: 'audio', url: './stems/bed.wav' },
  at: 0,
  gain: duckEnvelope(timing, { duck: 0.25, attack: 0.15, release: 0.4 }),
};
```

Gain envelopes are keys-only (`{ keys }`); a full `track()` still works but its target string carries no meaning on a clip.

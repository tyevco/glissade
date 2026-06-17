/**
 * '@glissade/narrate/providers' — the Node-only prepare side. Provider calls
 * happen HERE, in `gs narrate`, never at render time: render consumes only
 * the committed timing manifest + cached wavs, fully offline.
 *
 * Caching contract: each segment keys on sha256(text, voice, rate, provider,
 * providerVersion) — unchanged segments never re-synthesize, so re-renders
 * are reproducible and cheap. The cache manifest is committable JSON.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  isPause,
  NarrationError,
  type NarrationScript,
  type NarrationTiming,
  type TimedPause,
  type TimedSegment,
  type TimedWord,
} from './index.js';

export interface TtsRequest {
  text: string;
  voice?: string;
  rate?: number;
}

export interface TtsResult {
  /** RIFF/WAV bytes */
  wav: Buffer;
  /** seconds, exact from the audio data */
  duration: number;
  /** word timestamps RELATIVE to the segment, when the provider supplies them */
  words?: { word: string; start: number; end: number }[];
}

export interface TtsProvider {
  readonly id: string;
  /** participates in the cache key: bumping it invalidates synthesized audio */
  version(): Promise<string>;
  synthesize(req: TtsRequest): Promise<TtsResult>;
}

/** Parse duration from a RIFF/WAV header (PCM): data bytes / byte-rate. */
export function wavDuration(wav: Buffer): number {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new NarrationError('not a RIFF/WAVE file');
  }
  let byteRate = 0;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'fmt ') byteRate = wav.readUInt32LE(offset + 16);
    if (id === 'data') {
      if (byteRate === 0) throw new NarrationError('WAV data chunk before fmt');
      return size / byteRate;
    }
    offset += 8 + size + (size % 2);
  }
  throw new NarrationError('WAV has no data chunk');
}

// ---- fake: deterministic synthesis for CI, tests, and offline previews ----

/**
 * A pure function of the request: a quiet tone whose duration models reading
 * speed (≈170 wpm + lead-out). Same text → identical bytes, every machine.
 */
export function fakeProvider(): TtsProvider {
  const RATE = 22050;
  return {
    id: 'fake',
    version: () => Promise.resolve('fake-1'),
    synthesize: (req) => {
      const words = req.text.trim().split(/\s+/).filter(Boolean);
      const rate = req.rate ?? 1;
      // frame-quantize FIRST so reported duration === wavDuration(bytes)
      const frames = Math.round((Math.max(0.4, (words.length * (60 / 170) + 0.25) / rate)) * RATE);
      const duration = frames / RATE;
      const data = Buffer.alloc(frames * 2);
      // pitch seeded by the text so different segments are audibly distinct
      const seed = createHash('sha256').update(req.text).digest()[0]!;
      const freq = 180 + (seed % 12) * 20;
      for (let i = 0; i < frames; i++) {
        const env = Math.min(1, i / 800, (frames - i) / 800);
        data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / RATE) * 6000 * env), i * 2);
      }
      const header = Buffer.alloc(44);
      header.write('RIFF', 0, 'ascii');
      header.writeUInt32LE(36 + data.length, 4);
      header.write('WAVE', 8, 'ascii');
      header.write('fmt ', 12, 'ascii');
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20); // PCM
      header.writeUInt16LE(1, 22); // mono
      header.writeUInt32LE(RATE, 24);
      header.writeUInt32LE(RATE * 2, 28); // byte rate
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write('data', 36, 'ascii');
      header.writeUInt32LE(data.length, 40);
      // word timestamps: evenly spread (fake, but structurally real for tests)
      const per = duration / Math.max(words.length, 1);
      const wordTimes = words.map((word, i) => ({ word, start: i * per, end: (i + 1) * per }));
      return Promise.resolve({ wav: Buffer.concat([header, data]), duration, words: wordTimes });
    },
  };
}

// ---- espeak-ng: the local/offline option ----

export function espeakProvider(): TtsProvider {
  return {
    id: 'espeak',
    version: () => {
      const r = spawnSync('espeak-ng', ['--version'], { encoding: 'utf8' });
      if (r.status !== 0) {
        throw new NarrationError("espeak-ng not found on PATH — install it, or use --provider fake/openai");
      }
      return Promise.resolve(r.stdout.trim().split('\n')[0] ?? 'espeak-ng');
    },
    synthesize: (req) => {
      const args = ['--stdout'];
      if (req.voice) args.push('-v', req.voice);
      // espeak speed is wpm; map our rate multiplier around its 175 default
      args.push('-s', String(Math.round(175 * (req.rate ?? 1))));
      args.push(req.text);
      const r = spawnSync('espeak-ng', args, { maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0 || !r.stdout || r.stdout.length < 44) {
        throw new NarrationError(`espeak-ng failed: ${r.stderr?.toString().slice(0, 300) ?? 'no output'}`);
      }
      const wav = Buffer.from(r.stdout);
      return Promise.resolve({ wav, duration: wavDuration(wav) });
    },
  };
}

// ---- OpenAI: the cloud option (OPENAI_API_KEY) ----

export function openaiProvider(opts: { model?: string } = {}): TtsProvider {
  const model = opts.model ?? 'gpt-4o-mini-tts';
  return {
    id: 'openai',
    version: () => Promise.resolve(model),
    synthesize: async (req) => {
      const key = process.env['OPENAI_API_KEY'];
      if (!key) throw new NarrationError('OPENAI_API_KEY is not set — required for --provider openai');
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          voice: req.voice ?? 'alloy',
          input: req.text,
          response_format: 'wav',
          ...(req.rate !== undefined ? { speed: req.rate } : {}),
        }),
      });
      if (!res.ok) throw new NarrationError(`openai tts failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const wav = Buffer.from(await res.arrayBuffer());
      return { wav, duration: wavDuration(wav) };
    },
  };
}

// ---- Piper: local NEURAL TTS (rhasspy/piper) — offline, free, no key ----

/**
 * VITS-based local TTS: far more natural than espeak, runs on CPU, fully
 * offline. Needs a voice MODEL (`.onnx` + sibling `.onnx.json`) — pass its
 * path as `model`, or per-segment as `voice`. Emits no word timestamps; the
 * alignment step (below) fills them in.
 *
 * DETERMINISTIC by default: VITS adds noise (generator + the stochastic
 * duration predictor), so the same text re-synthesizes to slightly different
 * audio/durations. glissade zeroes both noise scales so re-synth is
 * byte-identical — reproducible pipelines, glissade's determinism contract.
 * For piper's more-natural (but drifting) prosody, pass its defaults
 * (`{ noiseScale: 0.667, noiseWScale: 0.8 }`) and wire via `providerImpl`.
 * The noise mode is part of `version()`, so changing it invalidates the cache.
 */
/**
 * Resolve a piper voice to something piper-tts 1.x can actually open. piper's
 * `--model` wants a filesystem PATH to the `.onnx`, or a downloadable voice KEY
 * — it does NOT search for a bare `.onnx` filename. So: an existing path is used
 * as-is (absolutized); a bare `<name>`/`<name>.onnx` is looked up under the
 * voices dir (`voicesDir` option → `PIPER_VOICES` env → `~/.local/share/piper-voices`);
 * a `.onnx` name that resolves nowhere is a clear error; a bare key with no
 * `.onnx` is passed through so piper can resolve/download it.
 */
export function resolvePiperVoice(model: string, voicesDir?: string): string {
  if (existsSync(model)) return resolve(model); // a real path (absolute or relative to cwd)
  if (isAbsolute(model)) return model; // absolute but missing — let piper report the real path
  const dir = voicesDir ?? process.env['PIPER_VOICES'] ?? join(homedir(), '.local', 'share', 'piper-voices');
  const named = model.endsWith('.onnx') ? model : `${model}.onnx`;
  for (const cand of [join(dir, model), join(dir, named)]) {
    if (existsSync(cand)) return resolve(cand);
  }
  if (model.endsWith('.onnx')) {
    throw new NarrationError(
      `piper voice '${model}' not found — it is not a path and is absent from the voices dir '${dir}'. ` +
        `Put the .onnx there, pass an absolute path as the voice, or set PIPER_VOICES / { voicesDir }.`,
    );
  }
  return model; // bare voice KEY (no .onnx extension) — let piper resolve/download it
}

/** Surface the TAIL of a child's stderr — Python tracebacks put the real exception last. */
export function stderrTail(stderr: unknown, max = 400): string {
  const s = (stderr == null ? '' : String(stderr)).trim();
  if (!s) return 'no output';
  return s.length > max ? `…${s.slice(-max)}` : s;
}

export function piperProvider(opts: { model?: string; voicesDir?: string; noiseScale?: number; noiseWScale?: number } = {}): TtsProvider {
  const noiseScale = opts.noiseScale ?? 0;
  const noiseWScale = opts.noiseWScale ?? 0;
  return {
    id: 'piper',
    version: () => {
      // Detect PRESENCE via spawn success, not exit code: piper-tts 1.x has no
      // `--version` action (argparse exits non-zero needing -m), so an exit
      // code can't mean "absent". ENOENT is the only true "not installed";
      // anything that actually ran means piper is here. A version string is
      // parsed only if one prints (the legacy standalone binary does; piper-tts
      // doesn't), so the cache key stays stable either way.
      const r = spawnSync('piper', ['--version'], { encoding: 'utf8' });
      if (r.error) {
        if ((r.error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new NarrationError(
            'piper not found on PATH — `pip install piper-tts` (or the standalone rhasspy/piper), ' +
              'or use --provider fake/espeak/openai',
          );
        }
        throw new NarrationError(`could not run piper: ${r.error.message}`);
      }
      const m = /\b\d+\.\d+\.\d+\b/.exec(r.stdout ?? ''); // stdout only — avoid usage-text false matches
      // noise mode is in the cache key: switching deterministic↔natural re-synthesizes
      const noise = `noise=${noiseScale}/${noiseWScale}`;
      const v = m ? `piper ${m[0]}` : 'piper';
      return Promise.resolve([v, noise, opts.model ? basename(opts.model) : null].filter(Boolean).join(' '));
    },
    synthesize: (req) => {
      const raw = req.voice ?? opts.model;
      if (!raw) {
        throw new NarrationError(
          'piper needs a voice model (.onnx) — pass { model }, or set the segment voice to its path or name',
        );
      }
      // piper can't open a bare ".onnx" name — resolve it to a real path first
      const model = resolvePiperVoice(raw, opts.voicesDir);
      const tag = createHash('sha256').update(req.text).digest('hex').slice(0, 8);
      const out = join(tmpdir(), `glissade-piper-${process.pid}-${tag}.wav`);
      // noise scales 0/0 (default) make synthesis byte-deterministic (§verified
      // on piper-tts 1.4.2); --noise-w-scale zeroes the stochastic duration
      // predictor, --noise-scale the generator
      const args = [
        '--model', model,
        '--output_file', out,
        '--noise-scale', String(noiseScale),
        '--noise-w-scale', String(noiseWScale),
      ];
      // piper speed is length_scale (lower = faster): invert our rate multiplier.
      // underscore form works on BOTH piper-tts 1.x (which aliases
      // --length-scale/--length_scale) and the legacy standalone binary —
      // verified against piper-tts 1.4.2.
      if (req.rate !== undefined && req.rate > 0) args.push('--length_scale', String(1 / req.rate));
      const r = spawnSync('piper', args, { input: req.text, maxBuffer: 64 * 1024 * 1024 });
      try {
        if (r.status !== 0 || !existsSync(out)) {
          throw new NarrationError(`piper failed: ${stderrTail(r.stderr)}`);
        }
        const wav = readFileSync(out);
        return Promise.resolve({ wav, duration: wavDuration(wav) });
      } finally {
        if (existsSync(out)) unlinkSync(out);
      }
    },
  };
}

// ---- Kokoro: local NEURAL TTS (kokoro-js / Transformers.js) — offline, Apache-2.0 ----

/** PCM16 mono WAV from float samples in [-1, 1]. Round-to-nearest → deterministic. */
export function floatToWav(samples: Float32Array, sampleRate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export type KokoroDtype = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';

// the slice of kokoro-js we use, typed locally so the build never hard-depends
// on it (it is an OPTIONAL peer — present for tests, absent for embedders who
// don't author narration with `--provider kokoro`)
interface KokoroAudio {
  audio: Float32Array;
  sampling_rate: number;
}
interface KokoroModel {
  generate(text: string, opts: { voice?: string; speed?: number }): Promise<KokoroAudio>;
}
interface KokoroLib {
  KokoroTTS: { from_pretrained(id: string, opts: { dtype?: string; device?: string }): Promise<KokoroModel> };
}

const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_DEFAULT_VOICE = 'af_heart';

/**
 * Apache-2.0 82M neural TTS — markedly more natural than espeak/piper, fully
 * offline on CPU via onnxruntime, no API key. Pure-Node through `kokoro-js`
 * (Transformers.js), so unlike piper there is no `pip install` / external
 * binary; `kokoro-js` is an OPTIONAL peer dep, lazy-loaded here.
 *
 * DETERMINISTIC by construction: inference takes tokenized phonemes + a FIXED
 * voice/style embedding (not diffusion-sampled per call), so the same text →
 * byte-identical PCM — no noise to zero out (piper's trick). `version()` pins
 * the lib version + model + dtype, so any of those moving invalidates the
 * cache. The model (~q8 92MB / fp32 326MB) downloads + caches on first use; it
 * stays out of the bundle and the determinism-critical path.
 */
/** kokoro-js version read by walking up from its entry (it does not export
 * `./package.json`, so the subpath can't be resolved directly). */
function kokoroVersionFrom(entry: string): string {
  let dir = dirname(entry);
  for (let i = 0; i < 8; i++) {
    const p = join(dir, 'package.json');
    if (existsSync(p)) {
      try {
        const j = JSON.parse(readFileSync(p, 'utf8')) as { name?: string; version?: string };
        if (j.name === 'kokoro-js' && j.version) return j.version;
      } catch {
        /* keep walking */
      }
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return 'unknown';
}

/**
 * Resolve the OPTIONAL peer `kokoro-js` from the USER'S project first. Under
 * pnpm's isolated layout a peer is NOT linked into `@glissade/narrate`'s own
 * store dir, so a bare `import('kokoro-js')` from this module fails; resolving
 * relative to `process.cwd()` (where the user ran `add kokoro-js`) finds it.
 * Falls back to this module for hoisted/global installs. Returns a `file://`
 * entry URL (so the dynamic import is never bundled) + the resolved version.
 * Throws a NarrationError that carries the REAL resolution error.
 */
function resolveKokoro(): { entryUrl: string; version: string } {
  const bases = [pathToFileURL(join(process.cwd(), 'package.json')).href, import.meta.url];
  let lastErr: NodeJS.ErrnoException | undefined;
  for (const base of bases) {
    try {
      const entry = createRequire(base).resolve('kokoro-js');
      return { entryUrl: pathToFileURL(entry).href, version: kokoroVersionFrom(entry) };
    } catch (e) {
      lastErr = e as NodeJS.ErrnoException;
    }
  }
  throw new NarrationError(
    `kokoro-js could not be resolved from ${process.cwd()} (${lastErr?.code ?? 'error'}: ${lastErr?.message ?? 'not found'}) — ` +
      'install it in your project (npm / pnpm / yarn add kokoro-js; pnpm users must also allow its native build scripts — see the narration docs), ' +
      'or use --provider piper/espeak/openai',
  );
}

export function kokoroProvider(opts: { model?: string; voice?: string; dtype?: KokoroDtype } = {}): TtsProvider {
  const modelId = opts.model ?? KOKORO_MODEL;
  const dtype: KokoroDtype = opts.dtype ?? 'q8';
  let loaded: Promise<KokoroModel> | null = null;

  const loadLib = async (): Promise<KokoroLib> => {
    const { entryUrl } = resolveKokoro(); // throws (with the real error) if absent
    let mod: Record<string, unknown>;
    try {
      mod = (await import(entryUrl)) as Record<string, unknown>;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      throw new NarrationError(
        `kokoro-js failed to load from ${entryUrl} (${err?.code ?? 'error'}: ${err?.message ?? String(e)}) — ` +
          'ensure kokoro-js and onnxruntime-node are installed, or use --provider piper/espeak/openai',
      );
    }
    // dual-package interop: ESM exposes named exports; CJS lands under `default`
    const lib = (mod['KokoroTTS'] ? mod : (mod['default'] as Record<string, unknown>)) as unknown as KokoroLib;
    if (!lib?.KokoroTTS) throw new NarrationError(`kokoro-js loaded but exposes no KokoroTTS export (from ${entryUrl})`);
    return lib;
  };
  const getModel = (): Promise<KokoroModel> =>
    (loaded ??= loadLib().then((k) => k.KokoroTTS.from_pretrained(modelId, { dtype, device: 'cpu' })));

  return {
    id: 'kokoro',
    version: () => {
      // the kokoro-js version is in the cache key (its g2p/phonemizer + model
      // packaging can move bytes); resolveKokoro throws the install hint +
      // real error when the optional peer is absent (feature-detection)
      const { version } = resolveKokoro();
      return Promise.resolve(`kokoro-js ${version} ${basename(modelId)} dtype=${dtype}`);
    },
    synthesize: async (req) => {
      const tts = await getModel();
      const voice = req.voice ?? opts.voice ?? KOKORO_DEFAULT_VOICE;
      const genOpts: { voice: string; speed?: number } =
        req.rate !== undefined && req.rate > 0 ? { voice, speed: req.rate } : { voice };
      let audio: KokoroAudio;
      try {
        audio = await tts.generate(req.text, genOpts);
      } catch (e) {
        throw new NarrationError(`kokoro synthesis failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      const wav = floatToWav(audio.audio, audio.sampling_rate);
      return { wav, duration: wavDuration(wav) };
    },
  };
}

export function providerById(id: string): TtsProvider {
  switch (id) {
    case 'fake':
      return fakeProvider();
    case 'espeak':
      return espeakProvider();
    case 'piper':
      return piperProvider();
    case 'kokoro':
      return kokoroProvider();
    case 'openai':
      return openaiProvider();
    default:
      throw new NarrationError(`unknown TTS provider '${id}' (have: fake, espeak, piper, kokoro, openai)`);
  }
}

// ---- word alignment: fill word timings for providers that emit none ----

export interface AlignRequest {
  /** the synthesized RIFF/WAV bytes */
  wav: Buffer;
  /** the spoken text (the segment text) */
  text: string;
}

/**
 * Turns (audio, known text) into per-word timings — the provider-independent
 * way to get word timestamps. Runs ONLY in the prepare step (heavy work is
 * fine; it runs once and the result is cached). Same three-member shape as
 * TtsProvider: `version()` participates in the cache so swapping aligners
 * re-aligns the CACHED wav without re-synthesizing.
 */
export interface Aligner {
  readonly id: string;
  version(): Promise<string>;
  align(req: AlignRequest): Promise<{ word: string; start: number; end: number }[]>;
}

/** ≈ syllable count: vowel groups, floored at 1 — a cheap spoken-length proxy. */
function syllableWeight(word: string): number {
  const groups = word.toLowerCase().match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

/**
 * Distribute words across the clip by estimated spoken length (syllables, not
 * characters — closer to real timing). Pure, deterministic, zero-dependency:
 * the always-available floor. Good enough for captions; karaoke on a very
 * slow/fast word wants a real aligner.
 */
export function heuristicWords(text: string, duration: number): { word: string; start: number; end: number }[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const weights = words.map(syllableWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  const out: { word: string; start: number; end: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < words.length; i++) {
    const span = (weights[i]! / total) * duration;
    out.push({ word: words[i]!, start: cursor, end: cursor + span });
    cursor += span;
  }
  return out;
}

export function heuristicAligner(): Aligner {
  return {
    id: 'heuristic',
    version: () => Promise.resolve('heuristic-1'),
    align: (req) => Promise.resolve(heuristicWords(req.text, wavDuration(req.wav))),
  };
}

// ---- shared: transfer audio-derived word timings onto the KNOWN script ----

const normalizeWord = (w: string): string => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Fill words whose start/end are NaN by linear interpolation between their
 * known neighbours (edges clamp). Keeps the result monotonic. Used after
 * mapping when some script words got no timing.
 */
export function interpolateMissing(
  words: { word: string; start: number; end: number }[],
): { word: string; start: number; end: number }[] {
  const out = words.map((w) => ({ ...w }));
  const n = out.length;
  let k = 0;
  while (k < n) {
    if (!Number.isNaN(out[k]!.start)) {
      k++;
      continue;
    }
    let j = k;
    while (j < n && Number.isNaN(out[j]!.start)) j++;
    const lo = k > 0 ? out[k - 1]!.end : j < n ? out[j]!.start : 0;
    const hi = j < n ? out[j]!.start : lo;
    const count = j - k;
    const span = Math.max(0, hi - lo);
    for (let t = 0; t < count; t++) {
      out[k + t]!.start = lo + (span * t) / count;
      out[k + t]!.end = lo + (span * (t + 1)) / count;
    }
    k = j;
  }
  return out;
}

/**
 * Transfer timed words (from an aligner) onto the script's own word tokens.
 * Forced aligners return near-identical words; ASR (whisper) can differ
 * (numbers spelled out, punctuation), so we LCS-align the normalized
 * sequences and interpolate script words the aligner didn't time. Output
 * length === script word count, in script order — what `wordBoxes()` indexes
 * against. If nothing matched, distribute by syllable over the timed span.
 */
export function mapAsrToScript(
  timed: { word: string; start: number; end: number }[],
  scriptText: string,
): { word: string; start: number; end: number }[] {
  const script = scriptText.trim().split(/\s+/).filter(Boolean);
  if (script.length === 0 || timed.length === 0) return [];
  const s = script.map(normalizeWord);
  const a = timed.map((w) => normalizeWord(w.word));
  const n = s.length;
  const m = a.length;
  // LCS table → backtrack the matched (scriptIndex → timedIndex) pairs
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = s[i] !== '' && s[i] === a[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const matched: (number | null)[] = new Array<number | null>(n).fill(null);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (s[i] !== '' && s[i] === a[j]) {
      matched[i] = j;
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  if (matched.every((x) => x === null)) {
    const lo = Math.min(...timed.map((w) => w.start));
    const hi = Math.max(...timed.map((w) => w.end));
    return heuristicWords(scriptText, Math.max(0, hi - lo)).map((w) => ({ ...w, start: w.start + lo, end: w.end + lo }));
  }
  return interpolateMissing(
    script.map((word, k) => {
      const mi = matched[k];
      return mi != null ? { word, start: timed[mi]!.start, end: timed[mi]!.end } : { word, start: NaN, end: NaN };
    }),
  );
}

// ---- Vosk: offline ASR word timings via the `vosk-align` command ----

/** one word from vosk-align's JSON output */
export interface VoskAlignWord {
  word: string;
  start: number;
  end: number;
  conf?: number;
}

/**
 * Word timings via Vosk (alphacephei) — offline ASR, Apache-2.0. Shells out to
 * a `vosk-align` command (the Python `vosk` binding + ffmpeg — deliberately NOT
 * the npm `vosk` package, whose `ffi-napi` native build is broken on modern
 * Node). The command reads any audio and writes
 *   { "words": [ { "word", "start", "end", "conf"? }, … ] }
 * to stdout; its recognized words are LCS-mapped onto the script tokens by
 * `mapAsrToScript`, so mis-recognitions (e.g. an unknown proper noun) just
 * interpolate cleanly between the words around them.
 *
 * Provide the command via `opts.command` / `VOSK_ALIGN` (default `vosk-align`);
 * the model is the command's own concern (its default, or `--model`/VOSK_MODEL),
 * passed through with `opts.model`.
 */
export function voskAligner(opts: { command?: string; model?: string } = {}): Aligner {
  const command = opts.command ?? process.env['VOSK_ALIGN'] ?? 'vosk-align';
  return {
    id: 'vosk',
    version: () => {
      // ENOENT is the only true "not found"; the command itself runs fine.
      const r = spawnSync(command, ['--help'], { encoding: 'utf8' });
      if (r.error) {
        if ((r.error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new NarrationError(
            `'${command}' not found — provide a vosk-align command (Apache-2.0 Vosk + ffmpeg, ` +
              'JSON {words:[{word,start,end}]} on stdout), or use --align heuristic',
          );
        }
        throw new NarrationError(`could not run ${command}: ${r.error.message}`);
      }
      return Promise.resolve(opts.model ? `vosk ${basename(opts.model)}` : 'vosk');
    },
    align: (req) => {
      const tag = createHash('sha256').update(req.text).digest('hex').slice(0, 8);
      const wavPath = join(tmpdir(), `glissade-vosk-${process.pid}-${tag}.wav`);
      try {
        writeFileSync(wavPath, req.wav);
        const args = [wavPath, ...(opts.model ? ['--model', opts.model] : [])];
        const r = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        if (r.error) throw new NarrationError(`${command} failed to run: ${r.error.message}`);
        if (r.status !== 0) throw new NarrationError(`${command} failed: ${(r.stderr || '').slice(0, 300)}`);
        const parsed = JSON.parse(r.stdout) as { words?: VoskAlignWord[] };
        const timed = (parsed.words ?? [])
          .filter((w) => typeof w.start === 'number' && typeof w.end === 'number')
          .map((w) => ({ word: w.word, start: w.start, end: w.end }));
        return Promise.resolve(mapAsrToScript(timed, req.text));
      } finally {
        if (existsSync(wavPath)) unlinkSync(wavPath);
      }
    },
  };
}

/** Resolve an aligner id; 'none' disables alignment (word-less segments). */
export function alignerById(id: string): Aligner | null {
  switch (id) {
    case 'none':
      return null;
    case 'heuristic':
      return heuristicAligner();
    case 'vosk':
      return voskAligner();
    default:
      throw new NarrationError(`unknown aligner '${id}' (have: heuristic, vosk, none)`);
  }
}

// ---- the prepare step: synthesize-with-cache → timing manifest ----

interface CacheEntry {
  /** wav filename, relative to the cache dir */
  file: string;
  /** segment-RELATIVE word timestamps — persisted so reuse keeps them */
  words?: { word: string; start: number; end: number }[];
  /** what produced `words`: 'provider', or '<alignerId>@<version>' — lets a
   *  changed aligner re-derive words from the cached wav, no re-synthesis */
  wordsFrom?: string;
}

interface CacheManifest {
  cacheVersion: 1;
  entries: Record<string, CacheEntry>;
}

export interface SynthesizeOptions {
  /** override the script's provider (by id) */
  provider?: string;
  /** override the script's aligner ('heuristic' | 'vosk' | 'none') */
  aligner?: string;
  /** a provider INSTANCE — wins over `provider`; the bring-your-own seam
   *  (e.g. a custom ElevenLabs/Azure TtsProvider) */
  providerImpl?: TtsProvider;
  /** an aligner INSTANCE (or null to disable) — wins over `aligner` */
  alignerImpl?: Aligner | null;
  /** ignore the cache and re-synthesize everything */
  force?: boolean;
}

export interface SynthesizeResult {
  timing: NarrationTiming;
  timingPath: string;
  cacheDir: string;
  synthesized: string[];
  reused: string[];
  /** segment ids whose words came from the aligner (not the provider) */
  aligned: string[];
  /** the aligner id used, or null when alignment was disabled */
  aligner: string | null;
}

export function cacheKey(seg: { text: string; voice?: string; rate?: number }, provider: string, providerVersion: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ text: seg.text, voice: seg.voice ?? null, rate: seg.rate ?? 1, provider, providerVersion }))
    .digest('hex');
}

/**
 * Read `<base>.narration.json`, synthesize what the cache lacks, and write
 * `<base>.narration.timing.json` + wavs under `<base>.narration-cache/`.
 * Both outputs are committable; everything downstream is offline.
 */
export async function synthesizeScript(scriptPath: string, opts: SynthesizeOptions = {}): Promise<SynthesizeResult> {
  const raw = JSON.parse(readFileSync(scriptPath, 'utf8')) as NarrationScript;
  if (raw.narrationVersion !== 1) throw new NarrationError(`unsupported narrationVersion ${String(raw.narrationVersion)}`);
  const ids = new Set<string>();
  for (const el of raw.segments) {
    if (ids.has(el.id)) throw new NarrationError(`duplicate narration id '${el.id}'`);
    ids.add(el.id);
    if (isPause(el) && !(el.pause > 0)) throw new NarrationError(`pause '${el.id}' needs pause > 0`);
  }

  const provider = opts.providerImpl ?? providerById(opts.provider ?? raw.provider ?? 'espeak');
  const providerVersion = await provider.version();

  // alignment fills word timings for providers that emit none; version() is
  // resolved lazily (first need) so a words-supplying provider never forces
  // an aligner's tooling to be installed
  const aligner =
    opts.alignerImpl !== undefined ? opts.alignerImpl : alignerById(opts.aligner ?? raw.align ?? 'heuristic');
  let alignerTag: string | null = null;
  const alignerTagFor = async (): Promise<string> => {
    if (alignerTag === null) alignerTag = `${aligner!.id}@${await aligner!.version()}`;
    return alignerTag;
  };

  const base = scriptPath.replace(/\.narration\.json$/, '');
  if (base === scriptPath) throw new NarrationError(`script path must end with .narration.json: ${scriptPath}`);
  const cacheDir = `${base}.narration-cache`;
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, 'cache.json');
  const cache: CacheManifest = existsSync(cachePath)
    ? (JSON.parse(readFileSync(cachePath, 'utf8')) as CacheManifest)
    : { cacheVersion: 1, entries: {} };

  const synthesized: string[] = [];
  const reused: string[] = [];
  const aligned: string[] = [];
  const segments: TimedSegment[] = [];
  const pauses: TimedPause[] = [];
  let cursor = raw.leadIn ?? 0;
  const elements = raw.segments;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]!;
    // a pause is silence we don't synthesize: record the window, advance the
    // clock. It supplies its own silence, so no default gap is added around it.
    if (isPause(el)) {
      pauses.push({ id: el.id, start: cursor, duration: el.pause, bed: el.bed ?? 'hold' });
      cursor += el.pause;
      continue;
    }
    const seg = el;
    const req: { text: string; voice?: string; rate?: number } = { text: seg.text };
    const voice = seg.voice ?? raw.voice;
    const rate = seg.rate ?? raw.rate;
    if (voice !== undefined) req.voice = voice;
    if (rate !== undefined) req.rate = rate;

    const hash = cacheKey(req, provider.id, providerVersion);
    let entry = cache.entries[hash];
    let duration: number;
    let wavBuf: Buffer;
    let words: { word: string; start: number; end: number }[] | undefined;

    if (entry !== undefined && !opts.force && existsSync(join(cacheDir, entry.file))) {
      wavBuf = readFileSync(join(cacheDir, entry.file));
      duration = wavDuration(wavBuf);
      reused.push(seg.id);
    } else {
      const result = await provider.synthesize(req);
      const file = `${seg.id}-${hash.slice(0, 8)}.wav`;
      writeFileSync(join(cacheDir, file), result.wav);
      wavBuf = result.wav;
      // duration comes from the BYTES, not the provider's report — the cached
      // path re-derives it the same way, so reuse is byte-stable
      duration = wavDuration(result.wav);
      entry = { file, ...(result.words !== undefined ? { words: result.words, wordsFrom: 'provider' } : {}) };
      cache.entries[hash] = entry;
      synthesized.push(seg.id);
    }

    // resolve words: provider words always win; otherwise align on the cached
    // wav (no re-synthesis), re-deriving when the aligner changed (wordsFrom)
    if (entry.wordsFrom === 'provider') {
      words = entry.words;
    } else if (aligner !== null) {
      const tag = await alignerTagFor();
      if (entry.wordsFrom === tag && entry.words !== undefined) {
        words = entry.words;
      } else {
        words = await aligner.align({ wav: wavBuf, text: seg.text });
        entry.words = words;
        entry.wordsFrom = tag;
        aligned.push(seg.id);
      }
    }

    const timed: TimedSegment = { id: seg.id, text: seg.text, start: cursor, duration, file: entry.file };
    if (words) {
      timed.words = words.map(
        (w): TimedWord => ({ word: w.word, start: cursor + w.start, end: cursor + w.end }),
      );
    }
    segments.push(timed);
    cursor += duration;
    // the default inter-segment gap applies only BETWEEN two segments; a pause
    // brings its own silence, so suppress the gap when one is adjacent
    const next = elements[i + 1];
    if (next && !isPause(next)) cursor += seg.gapAfter ?? raw.gap ?? 0.35;
  }

  // stable key order keeps the committed manifest diff-friendly
  cache.entries = Object.fromEntries(Object.entries(cache.entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');

  // totalDuration spans everything, including a trailing pause (intentional silence)
  const ends = [
    ...segments.map((s) => s.start + s.duration),
    ...pauses.map((p) => p.start + p.duration),
  ];
  const timing: NarrationTiming = {
    timingVersion: 1,
    provider: provider.id,
    providerVersion,
    totalDuration: ends.length > 0 ? Math.max(...ends) : 0,
    segments,
    ...(pauses.length > 0 ? { pauses } : {}),
    ...(raw.captionSplit ? { captionSplit: raw.captionSplit } : {}),
  };
  const timingPath = `${base}.narration.timing.json`;
  writeFileSync(timingPath, JSON.stringify(timing, null, 2) + '\n');
  return { timing, timingPath, cacheDir, synthesized, reused, aligned, aligner: aligner?.id ?? null };
}

/** Resolve `<scene>.narration.json` for a scene-module path (or accept the script itself). */
export function scriptPathFor(input: string): string {
  if (input.endsWith('.narration.json')) return input;
  const base = input.replace(/\.[jt]sx?$/, '');
  const candidate = `${base}.narration.json`;
  if (!existsSync(candidate)) {
    throw new NarrationError(
      `no narration script at ${join(dirname(candidate), basename(candidate))} — create it or pass the script path directly`,
    );
  }
  return candidate;
}

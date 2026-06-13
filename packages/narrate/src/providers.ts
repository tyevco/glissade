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
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { NarrationError, type NarrationScript, type NarrationTiming, type TimedSegment, type TimedWord } from './index.js';

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
 */
export function piperProvider(opts: { model?: string } = {}): TtsProvider {
  return {
    id: 'piper',
    version: () => {
      const r = spawnSync('piper', ['--version'], { encoding: 'utf8' });
      if (r.status !== 0) {
        throw new NarrationError(
          'piper not found on PATH — install rhasspy/piper, or use --provider fake/espeak/openai',
        );
      }
      const v = (r.stdout.trim() || r.stderr.trim() || 'piper').split('\n')[0]!;
      return Promise.resolve(opts.model ? `${v} ${basename(opts.model)}` : v);
    },
    synthesize: (req) => {
      const model = req.voice ?? opts.model;
      if (!model) {
        throw new NarrationError(
          'piper needs a voice model (.onnx) — pass { model }, or set the segment voice to its path',
        );
      }
      const tag = createHash('sha256').update(req.text).digest('hex').slice(0, 8);
      const out = join(tmpdir(), `glissade-piper-${process.pid}-${tag}.wav`);
      const args = ['--model', model, '--output_file', out];
      // piper speed is length_scale (lower = faster): invert our rate multiplier
      if (req.rate !== undefined && req.rate > 0) args.push('--length_scale', String(1 / req.rate));
      const r = spawnSync('piper', args, { input: req.text, maxBuffer: 64 * 1024 * 1024 });
      try {
        if (r.status !== 0 || !existsSync(out)) {
          throw new NarrationError(`piper failed: ${r.stderr?.toString().slice(0, 300) ?? 'no output'}`);
        }
        const wav = readFileSync(out);
        return Promise.resolve({ wav, duration: wavDuration(wav) });
      } finally {
        if (existsSync(out)) unlinkSync(out);
      }
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
    case 'openai':
      return openaiProvider();
    default:
      throw new NarrationError(`unknown TTS provider '${id}' (have: fake, espeak, piper, openai)`);
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

// ---- WAV decode + resample to Vosk's 16 kHz mono (pure, dependency-free) ----

interface WavMono {
  /** mono samples in [-1, 1] */
  samples: Float32Array;
  sampleRate: number;
}

/** Decode a 16-bit PCM RIFF/WAV to mono float samples (channels averaged). */
export function decodeWavMono(wav: Buffer): WavMono {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new NarrationError('not a RIFF/WAVE file');
  }
  let channels = 1;
  let sampleRate = 16000;
  let bits = 16;
  let dataOffset = -1;
  let dataSize = 0;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      channels = wav.readUInt16LE(offset + 10);
      sampleRate = wav.readUInt32LE(offset + 12);
      bits = wav.readUInt16LE(offset + 22);
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = size;
    }
    offset += 8 + size + (size % 2);
  }
  if (bits !== 16) throw new NarrationError(`only 16-bit PCM WAV is supported (got ${bits}-bit)`);
  if (dataOffset < 0) throw new NarrationError('WAV has no data chunk');
  const frames = Math.floor(dataSize / 2 / Math.max(1, channels));
  const samples = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) acc += wav.readInt16LE(dataOffset + (f * channels + c) * 2);
    samples[f] = acc / channels / 32768;
  }
  return { samples, sampleRate };
}

/** Linear-resample mono float to a 16 kHz int16 LE PCM buffer (Vosk's input). */
export function resampleTo16kPcm(input: WavMono): Buffer {
  const target = 16000;
  const ratio = input.sampleRate / target;
  const outLen = Math.max(1, Math.round(input.samples.length / ratio));
  const out = Buffer.alloc(outLen * 2);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const j = Math.floor(src);
    const frac = src - j;
    const a = input.samples[j] ?? 0;
    const b = input.samples[j + 1] ?? a;
    const v = Math.max(-1, Math.min(1, a + (b - a) * frac));
    out.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  return out;
}

// ---- Vosk: offline ASR, Apache-2.0, ~50 MB model, no Docker/Python ----

/** the slice of the (optional) `vosk` package we use — kept loose; no @types */
interface VoskModule {
  setLogLevel(level: number): void;
  Model: new (path: string) => { free(): void };
  Recognizer: new (opts: { model: object; sampleRate: number }) => {
    setWords(on: boolean): void;
    acceptWaveform(pcm: Buffer): boolean;
    finalResult(): { result?: { word: string; start: number; end: number }[] };
    free(): void;
  };
}

/**
 * Word timings via Vosk (alphacephei) — offline, Apache-2.0, ~50 MB model, a
 * real Node binding (no Python, no Docker, no multi-GB download). `vosk` is an
 * OPTIONAL peer: install it (`npm i vosk`) and point at a model
 * (`opts.model` / `VOSK_MODEL`) only if you use this aligner. ASR words are
 * mapped onto the script tokens by `mapAsrToScript`.
 */
export function voskAligner(opts: { model?: string } = {}): Aligner {
  const modelPath = opts.model ?? process.env['VOSK_MODEL'];
  let vosk: VoskModule | null = null;
  const load = async (): Promise<VoskModule> => {
    if (vosk) return vosk;
    try {
      // variable specifier: keep TS/bundler from resolving the optional dep
      const spec = 'vosk';
      vosk = (await import(spec)) as unknown as VoskModule;
    } catch {
      throw new NarrationError("vosk is not installed — `npm i vosk` and download a model, or use --align heuristic");
    }
    vosk.setLogLevel(-1);
    return vosk;
  };
  return {
    id: 'vosk',
    version: async () => {
      if (!modelPath) {
        throw new NarrationError('vosk needs a model — set VOSK_MODEL or pass { model } (alphacephei.com/vosk/models)');
      }
      if (!existsSync(modelPath)) throw new NarrationError(`vosk model not found at ${modelPath}`);
      await load();
      return `vosk:${basename(modelPath)}`;
    },
    align: async (req) => {
      const v = await load();
      const model = new v.Model(modelPath!);
      const rec = new v.Recognizer({ model, sampleRate: 16000 });
      try {
        rec.setWords(true);
        rec.acceptWaveform(resampleTo16kPcm(decodeWavMono(req.wav)));
        const timed = rec.finalResult().result ?? [];
        return mapAsrToScript(timed, req.text);
      } finally {
        rec.free();
        model.free();
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
  for (const s of raw.segments) {
    if (ids.has(s.id)) throw new NarrationError(`duplicate segment id '${s.id}'`);
    ids.add(s.id);
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
  let cursor = raw.leadIn ?? 0;

  for (const seg of raw.segments) {
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
    cursor += duration + (seg.gapAfter ?? raw.gap ?? 0.35);
  }

  // stable key order keeps the committed manifest diff-friendly
  cache.entries = Object.fromEntries(Object.entries(cache.entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');

  const timing: NarrationTiming = {
    timingVersion: 1,
    provider: provider.id,
    providerVersion,
    totalDuration: segments.length > 0 ? segments[segments.length - 1]!.start + segments[segments.length - 1]!.duration : 0,
    segments,
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

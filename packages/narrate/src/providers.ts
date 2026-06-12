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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
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

export function providerById(id: string): TtsProvider {
  switch (id) {
    case 'fake':
      return fakeProvider();
    case 'espeak':
      return espeakProvider();
    case 'openai':
      return openaiProvider();
    default:
      throw new NarrationError(`unknown TTS provider '${id}' (have: fake, espeak, openai)`);
  }
}

// ---- the prepare step: synthesize-with-cache → timing manifest ----

interface CacheEntry {
  /** wav filename, relative to the cache dir */
  file: string;
  /** segment-RELATIVE word timestamps — persisted so reuse keeps them */
  words?: { word: string; start: number; end: number }[];
}

interface CacheManifest {
  cacheVersion: 1;
  entries: Record<string, CacheEntry>;
}

export interface SynthesizeOptions {
  /** override the script's provider */
  provider?: string;
  /** ignore the cache and re-synthesize everything */
  force?: boolean;
}

export interface SynthesizeResult {
  timing: NarrationTiming;
  timingPath: string;
  cacheDir: string;
  synthesized: string[];
  reused: string[];
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

  const provider = providerById(opts.provider ?? raw.provider ?? 'espeak');
  const providerVersion = await provider.version();

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
    let words: { word: string; start: number; end: number }[] | undefined;

    if (entry !== undefined && !opts.force && existsSync(join(cacheDir, entry.file))) {
      duration = wavDuration(readFileSync(join(cacheDir, entry.file)));
      words = entry.words;
      reused.push(seg.id);
    } else {
      const result = await provider.synthesize(req);
      const file = `${seg.id}-${hash.slice(0, 8)}.wav`;
      writeFileSync(join(cacheDir, file), result.wav);
      // duration comes from the BYTES, not the provider's report — the cached
      // path re-derives it the same way, so reuse is byte-stable
      duration = wavDuration(result.wav);
      words = result.words;
      entry = { file, ...(words !== undefined ? { words } : {}) };
      cache.entries[hash] = entry;
      synthesized.push(seg.id);
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
  return { timing, timingPath, cacheDir, synthesized, reused };
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

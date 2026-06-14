/**
 * @glissade/sfx — sound effects, the determinism-safe way. A clean-room
 * procedural synth (sfxr-style: waveform + envelope + pitch slide + one-shot
 * arpeggio) renders byte-identical Int16 WAVs from a fixed param set — no
 * Math.random (the noise voice draws from core's seeded `random`), no
 * third-party synth code, so bundled effects are unambiguously license-clean.
 * Sample packs are supported too, but only with mandatory license + provenance.
 *
 * The render contract mirrors narration/music: effects are committed WAVs the
 * offline FFmpeg mix consumes. `buildSfxClips` places one AudioClip per hit,
 * with deterministic INDEX-SEEDED variation (pitch/gain) so repeated hits don't
 * sound machine-gun identical while staying a pure function of (seed, voice,
 * index) — re-evaluation never drifts.
 */

import { random, type AudioClip } from '@glissade/core';

export class SfxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SfxError';
  }
}

// ---- the clean-room synth ----

export type SfxWaveform = 'square' | 'saw' | 'sine' | 'noise';

/** The synth's knob set. Times are seconds; frequencies Hz; levels 0..1. */
export interface SfxrParams {
  waveform: SfxWaveform;
  /** linear fade-in */
  attack: number;
  /** flat hold at full level */
  sustain: number;
  /** linear fade-out to silence */
  decay: number;
  /** pitch at t=0 */
  startFreq: number;
  /** linear pitch glide, Hz per second (may be negative) */
  slide?: number;
  /** square-wave duty cycle, 0..1; ignored by other waveforms. Default 0.5 */
  duty?: number;
  /** output level, 0..1. Default 1 */
  volume?: number;
  /** one-shot arpeggio: after `arpTime` s, multiply the base pitch by this */
  arpMul?: number;
  arpTime?: number;
  /** deterministic seed for the noise waveform. Default a fixed constant. */
  noiseSeed?: number;
  /** render sample rate. Default 44100 */
  sampleRate?: number;
}

const DEFAULT_SAMPLE_RATE = 44100;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Render params to mono Int16 PCM. Pure and platform-stable: only IEEE-754
 * float math + the seeded RNG, quantized to Int16 last (the determinism
 * boundary), so the same params yield byte-identical samples everywhere.
 */
export function renderSfxr(params: SfxrParams): Int16Array {
  const sr = params.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const attack = Math.max(0, params.attack);
  const sustain = Math.max(0, params.sustain);
  const decay = Math.max(0, params.decay);
  const total = attack + sustain + decay;
  const n = Math.max(1, Math.round(total * sr));
  const out = new Int16Array(n);

  const slide = params.slide ?? 0;
  const duty = clamp(params.duty ?? 0.5, 0, 1);
  const volume = clamp(params.volume ?? 1, 0, 1);
  const noise = random((params.noiseSeed ?? 0x6d2b79f5) >>> 0);

  let phase = 0; // wave phase in cycles [0, 1)
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let base = params.startFreq;
    if (params.arpTime !== undefined && params.arpMul !== undefined && t >= params.arpTime) {
      base *= params.arpMul;
    }
    const freq = clamp(base + slide * t, 1, sr / 2);
    phase += freq / sr;
    phase -= Math.floor(phase);

    let s: number;
    switch (params.waveform) {
      case 'square':
        s = phase < duty ? 1 : -1;
        break;
      case 'saw':
        s = 2 * phase - 1;
        break;
      case 'sine':
        s = Math.sin(2 * Math.PI * phase);
        break;
      case 'noise':
        s = noise() * 2 - 1;
        break;
    }

    // attack / sustain / decay envelope
    let amp: number;
    if (t < attack) amp = attack > 0 ? t / attack : 1;
    else if (t < attack + sustain) amp = 1;
    else amp = decay > 0 ? 1 - (t - attack - sustain) / decay : 0;
    amp = clamp(amp, 0, 1);

    const v = s * amp * volume;
    out[i] = clamp(Math.round(v * 32767), -32768, 32767);
  }
  return out;
}

/** Standard 44-byte mono 16-bit PCM WAV. Deterministic byte-for-byte. */
export function encodeWavMono(samples: Int16Array, sampleRate = DEFAULT_SAMPLE_RATE): Uint8Array {
  const dataLen = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const str = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true); // PCM chunk size
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits per sample
  str(36, 'data');
  dv.setUint32(40, dataLen, true);
  for (let i = 0; i < samples.length; i++) dv.setInt16(44 + i * 2, samples[i]!, true);
  return new Uint8Array(buf);
}

// ---- the closed preset taxonomy ----

export type SfxPreset =
  | 'click'
  | 'tap'
  | 'pop'
  | 'whoosh'
  | 'success'
  | 'error'
  | 'type'
  | 'select'
  | 'coin'
  | 'blip';

/** The ten built-in voices. Frozen so a render is a pure function of the id. */
export const PRESETS: Readonly<Record<SfxPreset, Readonly<SfxrParams>>> = Object.freeze({
  click: { waveform: 'square', attack: 0.001, sustain: 0.004, decay: 0.03, startFreq: 1000, slide: -1600, duty: 0.5, volume: 0.7 },
  tap: { waveform: 'sine', attack: 0.001, sustain: 0.004, decay: 0.05, startFreq: 560, slide: -700, volume: 0.6 },
  pop: { waveform: 'sine', attack: 0.001, sustain: 0.002, decay: 0.06, startFreq: 420, slide: 2600, volume: 0.7 },
  whoosh: { waveform: 'noise', attack: 0.04, sustain: 0.02, decay: 0.26, startFreq: 1, volume: 0.45 },
  success: { waveform: 'square', attack: 0.002, sustain: 0.05, decay: 0.18, startFreq: 660, arpMul: 1.5, arpTime: 0.09, duty: 0.5, volume: 0.55 },
  error: { waveform: 'saw', attack: 0.004, sustain: 0.06, decay: 0.22, startFreq: 320, slide: -260, volume: 0.5 },
  type: { waveform: 'square', attack: 0.0005, sustain: 0.003, decay: 0.018, startFreq: 1200, slide: -900, duty: 0.4, volume: 0.5 },
  select: { waveform: 'sine', attack: 0.001, sustain: 0.01, decay: 0.05, startFreq: 760, slide: 900, volume: 0.6 },
  coin: { waveform: 'square', attack: 0.001, sustain: 0.02, decay: 0.16, startFreq: 900, arpMul: 1.6, arpTime: 0.045, duty: 0.5, volume: 0.55 },
  blip: { waveform: 'square', attack: 0.001, sustain: 0.012, decay: 0.05, startFreq: 880, duty: 0.5, volume: 0.6 },
});

/** Every preset id, in declaration order. */
export const SFX_PRESETS: readonly SfxPreset[] = Object.freeze(Object.keys(PRESETS) as SfxPreset[]);

// ---- the source seam (mirrors narrate's TtsProvider shape) ----

export interface SfxVoiceRef {
  id: string;
}

/**
 * A renderable bank of effect voices. `version()` feeds the prepare-step cache
 * key (bump to invalidate committed WAVs); `render()` returns committable audio
 * bytes for one voice. Bring your own (a different synth, a studio-rendered
 * pack) by implementing these three members.
 */
export interface SfxSource {
  readonly id: string;
  version(): string;
  voices(): SfxVoiceRef[];
  /** committable audio bytes (WAV) for one voice id */
  render(voiceId: string): Uint8Array;
}

/** The clean-room procedural source over the ten built-in presets. */
export function sfxrSource(opts: { sampleRate?: number } = {}): SfxSource {
  const sr = opts.sampleRate ?? DEFAULT_SAMPLE_RATE;
  return {
    id: 'sfxr',
    version: () => `sfxr-1/${sr}`,
    voices: () => SFX_PRESETS.map((id) => ({ id })),
    render: (voiceId) => {
      const preset = PRESETS[voiceId as SfxPreset];
      if (!preset) throw new SfxError(`unknown sfx preset '${voiceId}' (have: ${SFX_PRESETS.join(', ')})`);
      return encodeWavMono(renderSfxr({ ...preset, sampleRate: sr }), sr);
    },
  };
}

/** A sample pack: pre-rendered audio with MANDATORY license + provenance. */
export interface SfxSamplePack {
  id: string;
  /** SPDX id or license name — REQUIRED so nothing unlicensed ships silently */
  license: string;
  /** where the samples came from — REQUIRED provenance */
  source: string;
  /** voice id → audio bytes (WAV) */
  samples: Record<string, Uint8Array>;
}

/**
 * A source backed by committed sample files. License + source are mandatory and
 * validated at construction (a hard throw, like validateMusicTiming) — the
 * SuperDirt/lessac lesson: unlicensed audio must never ship by omission.
 */
export function samplePackSource(pack: SfxSamplePack): SfxSource {
  if (!pack.license) throw new SfxError(`sfx sample pack '${pack.id}' is missing a license (required)`);
  if (!pack.source) throw new SfxError(`sfx sample pack '${pack.id}' is missing a source/provenance (required)`);
  return {
    id: `pack-${pack.id}`,
    version: () => `${pack.id}@${pack.license}`,
    voices: () => Object.keys(pack.samples).map((id) => ({ id })),
    render: (voiceId) => {
      const data = pack.samples[voiceId];
      if (!data) throw new SfxError(`sfx sample pack '${pack.id}' has no sample '${voiceId}'`);
      return data;
    },
  };
}

// ---- committed cache + clip placement ----

/** FNV-1a 32-bit — a stable, deterministic string hash for voice seeding. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The committed WAV filename for a (source, voice) pair — used by both the
 * prepare step and the clip URLs, so they match by construction. */
export function sfxFileName(sourceId: string, voiceId: string): string {
  const safe = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${safe(sourceId)}-${safe(voiceId)}.wav`;
}

/**
 * Render every referenced voice once (deduped) — the prepare step's output, a
 * map of committed filename → WAV bytes.
 */
export function renderSfxAssets(source: SfxSource, voiceIds: Iterable<string>): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const v of new Set(voiceIds)) out[sfxFileName(source.id, v)] = source.render(v);
  return out;
}

/** One placed effect: a voice at a timeline second, with an optional gain. */
export interface SfxHit {
  voice: string;
  /** timeline seconds — e.g. beats.at('beat', 0.2) */
  at: number;
  /** per-hit linear gain; default 1 */
  gain?: number;
}

export interface SfxClipOptions {
  /** base url prefixing each committed WAV; default '.' */
  baseUrl?: string;
  /** scene seed for the index-seeded variation; default 0 */
  seed?: number;
  /** ± playbackRate jitter fraction (0 = off); e.g. 0.06 = ±6% pitch */
  jitterRate?: number;
  /** ± gain jitter fraction (0 = off) */
  jitterGain?: number;
  /** overall gain applied on top of each hit's gain; default 1 */
  gain?: number;
}

/**
 * Place hits as AudioClips for the timeline's `audio` array — one clip per hit
 * at `at`, referencing the committed WAV. Per-hit pitch/gain variation is
 * INDEX-SEEDED from core's `random` (seed ^ hash(source/voice) ^ index), so it
 * is a pure function of position: identical inputs → identical clip, and
 * re-evaluation out of order never drifts. Mirrors buildNarrationClips.
 */
export function buildSfxClips(hits: readonly SfxHit[], source: SfxSource, opts: SfxClipOptions = {}): AudioClip[] {
  const baseUrl = opts.baseUrl ?? '.';
  const seed = opts.seed ?? 0;
  const jitterRate = opts.jitterRate ?? 0;
  const jitterGain = opts.jitterGain ?? 0;
  const masterGain = opts.gain ?? 1;
  return hits.map((hit, index) => {
    const rng = random((seed ^ hashStr(`${source.id}/${hit.voice}`) ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0);
    const rate = 1 + (rng() * 2 - 1) * jitterRate;
    const gainScale = 1 + (rng() * 2 - 1) * jitterGain;
    const gain = (hit.gain ?? 1) * masterGain * gainScale;
    const clip: AudioClip = {
      asset: { kind: 'audio', url: `${baseUrl}/${sfxFileName(source.id, hit.voice)}` },
      at: hit.at,
    };
    if (jitterRate !== 0) clip.playbackRate = rate;
    if (gain !== 1) clip.gain = { keys: [{ t: 0, value: gain }] };
    return clip;
  });
}

// ---- keystroke sync: one click per typed/deleted character ----

/** One keystroke to sonify — the structural shape both the typewriter's
 * `EditMark` and a monotonic `RevealMark` satisfy. `kind` lets a backspace
 * take a different sample; absent, it's treated as an insert. */
export interface KeystrokeMark {
  time: number;
  grapheme: string;
  kind?: 'insert' | 'delete';
}

export interface KeystrokeOptions extends SfxClipOptions {
  /** voice for inserts (a typed char); default 'type' */
  insertVoice?: string;
  /** voice for deletes (a backspace); default = insertVoice */
  deleteVoice?: string;
  /**
   * Round-robin pool for inserts (overrides insertVoice) — a real keyboard
   * foley pack rotates several keypress recordings so the typing doesn't sound
   * looped. The per-keystroke pick is index-seeded (deterministic).
   */
  insertVoices?: readonly string[];
  /** round-robin pool for deletes (overrides deleteVoice; default = the insert pool) */
  deleteVoices?: readonly string[];
  /** graphemes to NOT click; default whitespace (space, tab, newline) */
  skip?: (grapheme: string) => boolean;
}

const isWhitespace = (g: string): boolean => /^\s+$/.test(g);

/**
 * One AudioClip per keystroke, placed at its time — the SFX side of the
 * typewriter, the analogue of buildNarrationClips. Consumes the typewriter's
 * `marks` (insert + delete) or a monotonic `revealSchedule` (inserts only).
 * Char-class policy lives HERE: whitespace is skipped by default, a backspace
 * can take a distinct voice, and a multi-sample pool round-robins (index-seeded)
 * for non-looping foley. The marks stay neutral data; everything is a pure
 * function of position.
 */
export function keystrokeClips(
  marks: readonly KeystrokeMark[],
  source: SfxSource,
  opts: KeystrokeOptions = {},
): AudioClip[] {
  const insertPool = opts.insertVoices ?? [opts.insertVoice ?? 'type'];
  const deletePool = opts.deleteVoices ?? (opts.deleteVoice ? [opts.deleteVoice] : insertPool);
  const skip = opts.skip ?? isWhitespace;
  const seed = opts.seed ?? 0;
  const hits: SfxHit[] = marks
    .filter((m) => !skip(m.grapheme))
    .map((m, index) => {
      const pool = m.kind === 'delete' ? deletePool : insertPool;
      let voice = pool[0]!;
      if (pool.length > 1) {
        // a separate seeded stream from buildSfxClips's pitch/gain jitter
        const r = random((seed ^ hashStr('keystroke') ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0)();
        voice = pool[Math.min(pool.length - 1, Math.floor(r * pool.length))]!;
      }
      return { voice, at: m.time };
    });
  return buildSfxClips(hits, source, opts);
}

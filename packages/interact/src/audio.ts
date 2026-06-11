/**
 * Offline audio amplitude (§C.1, separate entry '@glissade/interact/audio'):
 * DSP over decoded samples compiles to an ordinary Track — pure-of-frame, so
 * audio-reactive scenes with file-backed audio are PARAMETERIZED and export
 * with no trace at all (§A.6 route 1). Decoding stays at the edge (WebAudio /
 * ffmpeg); this module is pure float math, deterministic per the §2.5 engine
 * pin. The realtime audioDriver (live mic/stream) is reserved for v2.x.
 */

import { key, track, type Key, type Track } from '@glissade/core';

/** Decoded PCM — structurally an AudioBuffer's data, without requiring one. */
export interface DecodedAudio {
  sampleRate: number;
  /** One Float32Array per channel; channels are mixed down equally. */
  channelData: readonly Float32Array[];
}

export interface AudioAmplitudeOptions {
  /** Key grid for the emitted track; default 60. */
  fps?: number;
  /** Track target path; default 'audio/amplitude'. */
  target?: string;
  /** Hz range: band amplitude via Hann-windowed Goertzel probes instead of full-band RMS. */
  band?: [number, number];
  /** Scale the peak to 1; default true. */
  normalize?: boolean;
}

/** Adapt a WebAudio AudioBuffer to DecodedAudio. */
export function fromAudioBuffer(buffer: {
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(i: number): Float32Array;
}): DecodedAudio {
  const channelData: Float32Array[] = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) channelData.push(buffer.getChannelData(i));
  return { sampleRate: buffer.sampleRate, channelData };
}

export function audioAmplitudeTrack(audio: DecodedAudio, opts: AudioAmplitudeOptions = {}): Track<number> {
  const fps = opts.fps ?? 60;
  const channels = audio.channelData;
  const sr = audio.sampleRate;
  const length = channels[0]?.length ?? 0;
  const frames = Math.ceil((length / sr) * fps);
  const mono = (i: number): number => {
    let s = 0;
    for (const ch of channels) s += ch[i] ?? 0;
    return s / channels.length;
  };

  const values: number[] = [];
  for (let f = 0; f < frames; f++) {
    const start = Math.floor((f / fps) * sr);
    const end = Math.min(Math.floor(((f + 1) / fps) * sr), length);
    const n = end - start;
    if (n <= 0) {
      values.push(0);
      continue;
    }
    if (!opts.band) {
      let sum = 0;
      for (let i = start; i < end; i++) {
        const v = mono(i);
        sum += v * v;
      }
      values.push(Math.sqrt(sum / n));
    } else {
      // band amplitude: Goertzel power averaged over log-spaced probe frequencies
      const [lo, hi] = opts.band;
      const probes = 8;
      let power = 0;
      for (let k = 0; k < probes; k++) {
        const frac = k / (probes - 1);
        const freq = lo > 0 ? lo * Math.pow(hi / lo, frac) : lo + (hi - lo) * frac;
        power += goertzelPower(mono, start, n, freq / sr);
      }
      values.push(Math.sqrt(power / probes));
    }
  }

  if (opts.normalize !== false) {
    let peak = 0;
    for (const v of values) if (v > peak) peak = v;
    if (peak > 0) for (let i = 0; i < values.length; i++) values[i] = values[i]! / peak;
  }

  const keys: Key<number>[] =
    values.length > 0 ? values.map((v, f) => key(f / fps, v)) : [key(0, 0)];
  return track(opts.target ?? 'audio/amplitude', 'number', keys);
}

/** Hann-windowed Goertzel magnitude² at a normalized frequency, scaled to ~[0,1] for full-scale input. */
function goertzelPower(sample: (i: number) => number, start: number, n: number, normFreq: number): number {
  const coeff = 2 * Math.cos(2 * Math.PI * normFreq);
  let s1 = 0;
  let s2 = 0;
  const denom = n > 1 ? n - 1 : 1;
  for (let i = 0; i < n; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / denom);
    const s0 = sample(start + i) * hann + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (s1 * s1 + s2 * s2 - coeff * s1 * s2) / ((n * n) / 4);
}

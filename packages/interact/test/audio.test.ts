import { describe, expect, it } from 'vitest';
import { sampleTrack, type Track } from '@glissade/core';
import { audioAmplitudeTrack, fromAudioBuffer, type DecodedAudio } from '../src/audio.js';

function sine(freqs: number[], sampleRate: number, seconds: number, gain = 0.5): DecodedAudio {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const f of freqs) v += gain * Math.sin((2 * Math.PI * f * i) / sampleRate);
    data[i] = v;
  }
  return { sampleRate, channelData: [data] };
}

describe('audioAmplitudeTrack (§C.1): offline, pure-of-frame, parameterized export', () => {
  it('emits a frame-gridded number track normalized to peak 1', () => {
    const tr = audioAmplitudeTrack(sine([440], 8000, 0.5), { fps: 60 });
    expect(tr.target).toBe('audio/amplitude');
    expect(tr.type).toBe('number');
    expect(tr.keys.length).toBe(30); // ceil(0.5 s × 60)
    expect(tr.keys[1]!.t).toBeCloseTo(1 / 60, 12);
    // a steady tone normalizes to ~1 on every frame
    for (const k of tr.keys) expect(k.value as number).toBeGreaterThan(0.9);
    expect(Math.max(...tr.keys.map((k) => k.value as number))).toBe(1);
  });

  it('an amplitude envelope survives: loud frames over quiet frames', () => {
    const audio = sine([440], 8000, 0.5);
    const data = audio.channelData[0]! as Float32Array;
    for (let i = 0; i < data.length / 2; i++) data[i]! *= 0.1; // quiet first half
    const tr = audioAmplitudeTrack(audio, { fps: 60 });
    const first = tr.keys[2]!.value as number;
    const last = tr.keys[27]!.value as number;
    expect(last).toBeGreaterThan(first * 5);
    // and it samples like any other track — pure of frame
    expect(sampleTrack(tr as Track<number>, 27 / 60)).toBe(last);
  });

  it('band mode isolates frequency content', () => {
    const audio = sine([100, 3000], 8000, 0.4);
    const low = audioAmplitudeTrack(audio, { fps: 30, band: [50, 200], normalize: false });
    const mid = audioAmplitudeTrack(audio, { fps: 30, band: [800, 1200], normalize: false });
    const high = audioAmplitudeTrack(audio, { fps: 30, band: [2500, 3500], normalize: false });
    const mean = (tr: typeof low) => tr.keys.reduce((s, k) => s + (k.value as number), 0) / tr.keys.length;
    expect(mean(low)).toBeGreaterThan(mean(mid) * 5); // content at 100 Hz
    expect(mean(high)).toBeGreaterThan(mean(mid) * 5); // content at 3 kHz
  });

  it('is bit-deterministic and silence-safe', () => {
    const a = audioAmplitudeTrack(sine([220, 880], 8000, 0.3), { fps: 60, band: [100, 1000] });
    const b = audioAmplitudeTrack(sine([220, 880], 8000, 0.3), { fps: 60, band: [100, 1000] });
    expect(a.keys).toEqual(b.keys);
    const silent = audioAmplitudeTrack({ sampleRate: 8000, channelData: [new Float32Array(800)] }, { fps: 60 });
    for (const k of silent.keys) expect(k.value).toBe(0);
    const empty = audioAmplitudeTrack({ sampleRate: 8000, channelData: [new Float32Array(0)] });
    expect(empty.keys).toEqual([{ t: 0, value: 0 }]);
  });

  it('fromAudioBuffer adapts the WebAudio shape; channels mix down equally', () => {
    const left = new Float32Array(8000).fill(0.8);
    const right = new Float32Array(8000).fill(0); // silent right channel halves the mono RMS
    const decoded = fromAudioBuffer({
      sampleRate: 8000,
      numberOfChannels: 2,
      getChannelData: (i) => (i === 0 ? left : right),
    });
    const tr = audioAmplitudeTrack(decoded, { fps: 10, normalize: false, target: 'fab/level' });
    expect(tr.target).toBe('fab/level');
    expect(tr.keys[0]!.value as number).toBeCloseTo(0.4, 6);
  });
});

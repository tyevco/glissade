/**
 * The pure side of @glissade/narrate: anchors math, the caption hold-key
 * track, safe-area caption nodes, and sidecar formats. Everything here is a
 * function of the committed timing manifest — no provider, no I/O.
 */

import { describe, expect, it } from 'vitest';
import { sampleTrack, type AudioClip, type Track } from '@glissade/core';
import {
  captionNode,
  captionTrack,
  duckEnvelope,
  narration,
  NarrationError,
  toSrt,
  toVtt,
  type NarrationTiming,
} from '../src/index.js';

const TIMING: NarrationTiming = {
  timingVersion: 1,
  provider: 'fake',
  providerVersion: 'fake-1',
  totalDuration: 5.5,
  segments: [
    { id: 'a', text: 'First beat.', start: 0.25, duration: 1.5, file: 'a-11111111.wav' },
    { id: 'b', text: 'Second beat.', start: 2.1, duration: 2.0, file: 'b-22222222.wav' },
    { id: 'c', text: 'Done.', start: 4.5, duration: 1.0, file: 'c-33333333.wav' },
  ],
};

describe('narration() anchors', () => {
  const beats = narration(TIMING);

  it('start/end/duration address segments by id', () => {
    expect(beats.start('a')).toBe(0.25);
    expect(beats.end('a')).toBe(1.75);
    expect(beats.duration('b')).toBe(2.0);
    expect(beats.totalDuration).toBe(5.5);
  });

  it('an unknown id fails loudly, listing what exists', () => {
    expect(() => beats.start('nope')).toThrow(NarrationError);
    expect(() => beats.start('nope')).toThrow(/a, b, c/);
  });

  it('labels() yields <id>.start / <id>.end for every segment', () => {
    const labels = beats.labels();
    expect(labels['a.start']).toBe(0.25);
    expect(labels['c.end']).toBe(5.5);
    expect(Object.keys(labels)).toHaveLength(6);
  });

  it('clips() places one AudioClip per segment at its start', () => {
    const clips = beats.clips('./cache');
    expect(clips).toHaveLength(3);
    expect(clips[1]).toEqual({
      asset: { kind: 'audio', url: './cache/b-22222222.wav' },
      at: 2.1,
    });
  });

  it('assets() keys entries narration-<id>', () => {
    const assets = beats.assets('./cache');
    expect(assets['narration-c']).toEqual({ kind: 'audio', url: './cache/c-33333333.wav' });
  });
});

describe('captionTrack()', () => {
  const tr = captionTrack(TIMING);

  it('targets captions/text with hold keys only', () => {
    expect(tr.target).toBe('captions/text');
    expect(tr.type).toBe('string');
    for (const k of tr.keys) expect(k.interp).toBe('hold');
  });

  it('key times are strictly increasing (a valid track)', () => {
    for (let i = 1; i < tr.keys.length; i++) {
      expect(tr.keys[i]!.t).toBeGreaterThan(tr.keys[i - 1]!.t);
    }
  });

  it('samples empty during lead-in and gaps, text during segments, empty after', () => {
    const at = (t: number) => sampleTrack(tr as Track, t) as string;
    expect(at(0)).toBe(''); // lead-in
    expect(at(1.0)).toBe('First beat.');
    expect(at(1.9)).toBe(''); // gap between a (ends 1.75) and b (starts 2.1)
    expect(at(3.0)).toBe('Second beat.');
    expect(at(6.0)).toBe(''); // after the last segment
  });

  it('a segment starting at 0 replaces the leading empty key', () => {
    const tr0 = captionTrack({
      ...TIMING,
      segments: [{ id: 'x', text: 'Immediate.', start: 0, duration: 1, file: 'x.wav' }],
    });
    expect(tr0.keys[0]!.t).toBe(0);
    expect(tr0.keys[0]!.value).toBe('Immediate.');
    expect(sampleTrack(tr0 as Track, 0.5)).toBe('Immediate.');
    expect(sampleTrack(tr0 as Track, 1.5)).toBe('');
  });

  it('back-to-back segments (no gap) cut without an empty flash', () => {
    const tr2 = captionTrack({
      ...TIMING,
      segments: [
        { id: 'x', text: 'One.', start: 0.5, duration: 1, file: 'x.wav' },
        { id: 'y', text: 'Two.', start: 1.5, duration: 1, file: 'y.wav' },
      ],
    });
    expect(sampleTrack(tr2 as Track, 1.49)).toBe('One.');
    expect(sampleTrack(tr2 as Track, 1.5)).toBe('Two.');
  });

  it('honors a custom target', () => {
    expect(captionTrack(TIMING, { target: 'subs/text' }).target).toBe('subs/text');
  });
});

describe('captionNode()', () => {
  it('landscape: bottom-centered inside the 10% safe area', () => {
    const node = captionNode({ w: 640, h: 360 });
    expect(node.id).toBe('captions');
    expect(node.align).toBe('center');
    expect(node.position()).toEqual([320, Math.round(360 * 0.9)]);
    expect(node.width()).toBe(Math.round(640 * 0.82));
    expect(node.fontSize()).toBe(Math.round(360 * 0.06));
  });

  it('portrait: sits higher (18% inset — reels/shorts chrome) with a smaller face', () => {
    const node = captionNode({ w: 360, h: 640 });
    expect(node.position()).toEqual([180, Math.round(640 * 0.82)]);
    expect(node.fontSize()).toBe(Math.round(360 * 0.052));
  });

  it('style overrides win; filters default to a readability shadow', () => {
    const node = captionNode({ w: 640, h: 360 }, { fontSize: 20, bottomInsetFrac: 0.2, filters: [] });
    expect(node.fontSize()).toBe(20);
    expect(node.position()[1]).toBe(Math.round(360 * 0.8));
    expect(node.filters()).toEqual([]);
    expect(captionNode({ w: 640, h: 360 }).filters().length).toBeGreaterThan(0);
  });
});

describe('sidecar formats', () => {
  it('toSrt: numbered cues, comma millis', () => {
    const srt = toSrt(TIMING);
    expect(srt).toContain('1\n00:00:00,250 --> 00:00:01,750\nFirst beat.');
    expect(srt).toContain('3\n00:00:04,500 --> 00:00:05,500\nDone.');
    expect(srt.endsWith('\n')).toBe(true);
  });

  it('toVtt: WEBVTT header, dot millis, no cue numbers', () => {
    const vtt = toVtt(TIMING);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:02.100 --> 00:00:04.100\nSecond beat.');
  });

  it('cue boundaries match the caption track exactly (same manifest, same numbers)', () => {
    const tr = captionTrack(TIMING);
    for (const s of TIMING.segments) {
      expect(tr.keys.some((k) => k.t === s.start && k.value === s.text)).toBe(true);
    }
  });
});

describe('duckEnvelope: the music-bed gain from the narration manifest', () => {
  // TIMING gaps (0.35, 0.4) are inside the default merge threshold → ONE window
  it('default options merge close segments into one duck window', () => {
    const env = duckEnvelope(TIMING);
    expect(env.keys).toEqual([
      { t: 0, value: 1 },
      { t: 0.1, value: 1 }, // 0.25 − attack 0.15
      { t: 0.25, value: 0.25 },
      { t: 5.5, value: 0.25 },
      { t: 5.9, value: 1 }, // 5.5 + release 0.4
    ]);
  });

  it('tight ramps + mergeGap 0 keep the windows separate (three duck dips)', () => {
    const env = duckEnvelope(TIMING, { attack: 0.05, release: 0.05, mergeGap: 0 });
    const dips = env.keys.filter((k) => k.value === 0.25);
    expect(dips).toHaveLength(6); // down+up per window
    for (let i = 1; i < env.keys.length; i++) {
      expect(env.keys[i]!.t).toBeGreaterThan(env.keys[i - 1]!.t);
    }
  });

  it('clipAt shifts keys to clip-local time; pre-clip ramps clamp to an immediate duck', () => {
    const env = duckEnvelope(TIMING, { clipAt: 2 });
    expect(env.keys[0]).toEqual({ t: 0, value: 0.25 }); // already ducked when the clip starts
    const last = env.keys[env.keys.length - 1]!;
    expect(last.t).toBeCloseTo(3.9, 9); // 5.5 + release − clipAt
    expect(last.value).toBe(1);
  });

  it('plugs straight into AudioClip.gain (keys-only envelopes are accepted)', () => {
    const clip: AudioClip = {
      asset: { kind: 'audio', url: 'bed.wav' },
      at: 0,
      gain: duckEnvelope(TIMING, { duck: 0.3 }),
    };
    expect(clip.gain!.keys.length).toBeGreaterThan(0);
  });
});

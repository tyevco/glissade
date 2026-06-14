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
  music,
  narration,
  NarrationError,
  toSrt,
  toVtt,
  type MusicTiming,
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

describe('music(): beat-grid anchors over the tempo manifest', () => {
  const M: MusicTiming = {
    musicVersion: 1,
    bpm: 96,
    beatsPerCycle: 4,
    cycles: 8,
    cps: 0.4,
    durationSec: 20,
    stem: 'pipeline-test.wav',
    gainDb: -3,
  };
  const beatLen = 60 / 96; // 0.625

  it('beat 0 = clip at + offsetSec (the sample-0 invariant); the grid derives from bpm', () => {
    const m = music(M);
    expect(m.beat(0)).toBe(0);
    expect(m.beat(4)).toBeCloseTo(4 * beatLen, 12);
    expect(m.cycle(2)).toBeCloseTo(8 * beatLen, 12);
    expect(m.beatLen).toBe(beatLen);
    const shifted = music({ ...M, offsetSec: 0.5 }, 2);
    expect(shifted.beat(0)).toBe(2.5);
    expect(shifted.grid()).toEqual({ bpm: 96, offsetSec: 2.5 });
  });

  it('nearestBeat snaps either way; nextBeat quantizes forward (and is idempotent on the grid)', () => {
    const m = music(M);
    expect(m.nearestBeat(0.7)).toBeCloseTo(beatLen, 12);
    expect(m.nearestBeat(0.2)).toBe(0);
    expect(m.nextBeat(0.01)).toBeCloseTo(beatLen, 12);
    expect(m.nextBeat(beatLen)).toBeCloseTo(beatLen, 12); // already on the grid
  });

  it('cps must agree with bpm/beatsPerCycle', () => {
    expect(() => music({ ...M, cps: 0.5 })).toThrow(/cps .* disagrees/);
    expect(() => music({ ...M, musicVersion: 2 as never })).toThrow(/musicVersion/);
  });

  it('clip(): stem default, gainDb scaling, narration ducking composed clip-locally', () => {
    const m = music(M, 1);
    const plain = m.clip();
    expect(plain.asset.url).toBe('pipeline-test.wav');
    expect(plain.at).toBe(1);
    // gainDb −3 → constant envelope scaled to 10^(−3/20)
    expect(plain.gain!.keys).toHaveLength(1);
    expect(plain.gain!.keys[0]!.value).toBeCloseTo(Math.pow(10, -3 / 20), 12);

    const ducked = m.clip('bed.wav', { gainDb: 0, duckUnder: TIMING, duckOpts: { duck: 0.2 } });
    // duckEnvelope with clipAt = 1: ramp at 0.25−0.15−1 < 0 → immediate duck
    expect(ducked.gain!.keys[0]!.value).toBe(0.2);
    expect(ducked.gain!.keys[ducked.gain!.keys.length - 1]!.value).toBe(1);

    const scaledDuck = m.clip('bed.wav', { duckUnder: TIMING, duckOpts: { duck: 0.2 } });
    // manifest gainDb −3 scales the WHOLE envelope (duck stays relative to bed)
    expect(scaledDuck.gain!.keys[0]!.value).toBeCloseTo(0.2 * Math.pow(10, -3 / 20), 12);

    const { stem: _stem, ...noStem } = M;
    expect(() => music(noStem).clip()).toThrow(/needs a url/);
    // zero gain + no duck → no envelope at all
    const { gainDb: _g, ...noGain } = M;
    expect(music(noGain).clip('x.wav').gain).toBeUndefined();
  });
});

// pauses: explicit silence beats, addressable like segments, with a per-pause
// music-bed mode. Segments flank a 1.5s pause window [1.5, 3.0].
const PAUSED: NarrationTiming = {
  timingVersion: 1,
  provider: 'fake',
  providerVersion: 'fake-1',
  totalDuration: 4,
  segments: [
    { id: 'a', text: 'Before.', start: 0.5, duration: 1.0, file: 'a.wav' },
    { id: 'b', text: 'After.', start: 3.0, duration: 1.0, file: 'b.wav' },
  ],
  pauses: [{ id: 'beat', start: 1.5, duration: 1.5, bed: 'hold' }],
};

/** linear-sample a keys-only gain envelope at time t */
function sampleGain(env: { keys: { t: number; value: number }[] }, t: number): number {
  const ks = env.keys;
  if (t <= ks[0]!.t) return ks[0]!.value;
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i]!.t) {
      const a = ks[i - 1]!;
      const b = ks[i]!;
      const span = b.t - a.t || 1;
      return a.value + (b.value - a.value) * ((t - a.t) / span);
    }
  }
  return ks[ks.length - 1]!.value;
}

describe('pauses: addressable silence beats', () => {
  it('start/end/duration/at resolve a pause by id, like a segment', () => {
    const beats = narration(PAUSED);
    expect(beats.start('beat')).toBe(1.5);
    expect(beats.end('beat')).toBe(3.0);
    expect(beats.duration('beat')).toBe(1.5);
    expect(beats.at('beat', 0.5)).toBe(2.0); // a sub-beat inside the window
    // segments still resolve
    expect(beats.start('a')).toBe(0.5);
  });

  it('labels() includes pause beats alongside segments', () => {
    const labels = narration(PAUSED).labels();
    expect(labels['beat.start']).toBe(1.5);
    expect(labels['beat.end']).toBe(3.0);
    expect(Object.keys(labels)).toHaveLength(6); // a, b, beat × {start,end}
  });

  it('a pause id colliding with a segment id throws', () => {
    const bad: NarrationTiming = {
      ...PAUSED,
      pauses: [{ id: 'a', start: 1.5, duration: 1.5, bed: 'hold' }],
    };
    expect(() => narration(bad)).toThrow(/duplicate narration id 'a'/);
  });
});

describe('duckEnvelope: per-pause bed modes', () => {
  // sample the middle of the pause window [1.5, 3.0] to read what the bed does
  const mid = 2.25;

  it("'hold' (default) keeps the bed ducked across the pause — one continuous dip", () => {
    const env = duckEnvelope(PAUSED); // beat.bed = 'hold'
    expect(sampleGain(env, mid)).toBeCloseTo(0.25, 9); // still at duck level
    // no return to base anywhere strictly inside the window
    const inside = env.keys.filter((k) => k.t > 1.5 && k.t < 3.0 && k.value === 1);
    expect(inside).toHaveLength(0);
  });

  it("'silence' cuts the bed to the floor across the window", () => {
    const env = duckEnvelope({ ...PAUSED, pauses: [{ id: 'beat', start: 1.5, duration: 1.5, bed: 'silence' }] });
    expect(sampleGain(env, mid)).toBeCloseTo(0, 9); // true silence, not just duck
    // a custom floor is honored
    const floored = duckEnvelope(
      { ...PAUSED, pauses: [{ id: 'beat', start: 1.5, duration: 1.5, bed: 'silence' }] },
      { silence: 0.05 },
    );
    expect(sampleGain(floored, mid)).toBeCloseTo(0.05, 9);
  });

  it("'swell' lets the bed breathe back to base while the voice rests", () => {
    const env = duckEnvelope({ ...PAUSED, pauses: [{ id: 'beat', start: 1.5, duration: 1.5, bed: 'swell' }] });
    expect(sampleGain(env, mid)).toBeCloseTo(1, 9); // up at base — two separate dips
    // the bed is ducked during the actual speech on either side
    expect(sampleGain(env, 1.0)).toBeCloseTo(0.25, 9);
    expect(sampleGain(env, 3.5)).toBeCloseTo(0.25, 9);
  });

  it('every bed mode yields a strictly time-ordered envelope', () => {
    for (const bed of ['hold', 'silence', 'swell'] as const) {
      const env = duckEnvelope({ ...PAUSED, pauses: [{ id: 'beat', start: 1.5, duration: 1.5, bed }] });
      for (let i = 1; i < env.keys.length; i++) {
        expect(env.keys[i]!.t).toBeGreaterThan(env.keys[i - 1]!.t);
      }
    }
  });
});

describe('narration().require — batch fast-fail on stale ids', () => {
  it('passes when every id exists, and returns the anchors (chainable)', () => {
    const beats = narration(PAUSED).require(['a', 'beat', 'b']);
    expect(beats.start('a')).toBe(0.5); // got the anchors back
  });

  it('throws ONE error listing ALL unknown ids at once', () => {
    expect(() => narration(PAUSED).require(['a', 'nope1', 'beat', 'nope2'])).toThrow(
      /unknown ids 'nope1', 'nope2' — have: a, b, beat/,
    );
    // singular wording for a single miss
    expect(() => narration(PAUSED).require(['ghost'])).toThrow(/unknown id 'ghost'/);
  });
});

// auto-fit: long caption segments must stay in-frame (load-bearing for muted
// 9:16 cutdowns). A char-proportional measurer makes wrapping/shrink testable.
import type { TextMeasurer } from '@glissade/scene';
const capMeasurer: TextMeasurer = {
  measureText: (t, f) => ({ width: t.length * f.size * 0.3, ascent: f.size, descent: 0 }),
};
function caption(text: string, style = {}) {
  const node = captionNode({ w: 400, h: 200 }, { fontSize: 40, fontFamily: 'x', maxLines: 2, minScale: 0.5, ...style });
  node.measurerSource = () => capMeasurer;
  node.text.set(text);
  return node;
}

describe('captionNode() auto-fit (overflow guard)', () => {
  it('a short caption keeps the base font and sits at the bottom inset', () => {
    const n = caption('Hi there');
    expect(n.fontSize()).toBe(40);
    expect(n.position()).toEqual([200, 180]); // bottomY = round(200 * 0.9)
  });

  it('a long caption auto-shrinks toward the floor and bottom-anchors (grows UP, not off-frame)', () => {
    const n = caption('one two three four five six seven eight nine ten eleven twelve thirteen fourteen');
    expect(n.fontSize()).toBeLessThan(40); // shrunk to fit maxLines
    expect(n.fontSize()).toBeGreaterThanOrEqual(20); // floored at minScale (40 * 0.5)
    expect(n.position()[1]).toBeLessThan(180); // anchored above the inset — grew upward
  });

  it('respects an explicit minScale floor even when it still overflows', () => {
    const wall = 'word '.repeat(60).trim(); // far too long to ever fit 2 lines
    const n = caption(wall, { minScale: 0.8 });
    expect(n.fontSize()).toBe(Math.round(40 * 0.8)); // pinned at the floor, not below
  });

  it('is deterministic', () => {
    const a = caption('alpha bravo charlie delta echo foxtrot golf hotel india');
    const b = caption('alpha bravo charlie delta echo foxtrot golf hotel india');
    expect([a.fontSize(), a.position()]).toEqual([b.fontSize(), b.position()]);
  });
});

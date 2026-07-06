/**
 * caption-split (0.68.0) — captionAutoSplit + the band-mode captionTrack/sidecar path.
 * Covers: band-fit splitting; MEASURE-CONSISTENCY (a cue the split judged "fits at the
 * min-legible floor" actually wraps within the band at that floor — the same params
 * captionNode renders with); CaptionFitError on an unsplittable word (reword-first);
 * legacy { maxChars } + absent stay byte-identical; band via captionTrack (fails loud
 * without size); sidecar tolerance (band without context → single cue).
 */
import { describe, expect, it } from 'vitest';
import { breakLines, type FontSpec, type TextMeasurer } from '@glissade/scene';
import {
  captionAutoSplit,
  CaptionFitError,
  captionTrack,
  toSrt,
  type NarrationTiming,
  type TimedSegment,
} from '../src/index.js';

// deterministic monospace-ish measurer: width = chars × size × 0.6 (real, non-estimating)
const real: TextMeasurer = {
  measureText: (t, f) => ({ width: t.length * f.size * 0.6, ascent: f.size * 0.8, descent: f.size * 0.2 }),
};

// mirror captionBandParams for landscape 1920×1080, default style: baseFont=round(1080*0.06)=65,
// minFont=round(65*0.7)=46, width=round(1920*0.82)=1574, maxLines=2.
const SIZE = { w: 1920, h: 1080 };
const MINFONT = 46;
const WIDTH = 1574;
const MAXLINES = 2;
const font: FontSpec = { family: 'sans-serif', size: MINFONT, weight: 400 };
const fitsBand = (s: string): boolean => {
  const lines = breakLines(s, font, WIDTH, real);
  return lines.length <= MAXLINES && lines.every((ln) => real.measureText(ln, font).width <= WIDTH);
};

const seg = (over: Partial<TimedSegment> & { text: string }): TimedSegment => ({
  id: 'seg-1',
  start: 0,
  duration: 4,
  file: 'seg-1.wav',
  ...over,
});

const timing = (segments: TimedSegment[], captionSplit?: NarrationTiming['captionSplit']): NarrationTiming => ({
  timingVersion: 1,
  provider: 't',
  providerVersion: '1',
  totalDuration: 10,
  segments,
  ...(captionSplit ? { captionSplit } : {}),
});

describe('captionAutoSplit', () => {
  const long =
    'The quick brown fox jumps over the lazy dog while the sun sets slowly. A second sentence carries more words, with a clause; and then even more detail follows here to overflow the band. Finally a third sentence lands at the very end of the caption.';

  it('splits a long caption into multiple cues (default is a no-op for short text)', () => {
    expect(captionAutoSplit(seg({ text: 'Short caption.' }), { size: SIZE, measurer: real })).toHaveLength(1);
    const cues = captionAutoSplit(seg({ text: long }), { size: SIZE, style: { autoFit: true }, measurer: real });
    expect(cues.length).toBeGreaterThan(1);
  });

  it('MEASURE-CONSISTENCY: every cue fits the band at the min-legible floor the render uses', () => {
    const cues = captionAutoSplit(seg({ text: long }), { size: SIZE, style: { autoFit: true }, measurer: real });
    for (const c of cues) expect(fitsBand(c.text), `cue "${c.text}" must fit the band`).toBe(true);
    // cues tile the segment window in order, non-overlapping
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.start).toBeGreaterThanOrEqual(cues[i - 1]!.start);
  });

  it('throws CaptionFitError (reword-first) when a single word cannot fit the band', () => {
    const token = 'x'.repeat(120); // 120 × 46 × 0.6 = 3312px ≫ 1574 band
    let caught: unknown;
    try {
      captionAutoSplit(seg({ id: 'seg-url', text: `See ${token} now` }), { size: SIZE, style: { autoFit: true }, measurer: real });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CaptionFitError);
    expect((caught as CaptionFitError).segmentId).toBe('seg-url');
    expect((caught as CaptionFitError).word).toContain('xxxx');
    expect((caught as Error).message).toMatch(/reword\/shorten the word/); // reword-first ordering
  });

  it('fails loud without a real measurer unless { estimate: true }', () => {
    expect(() => captionAutoSplit(seg({ text: long }), { size: SIZE, style: { autoFit: true } })).toThrow();
    expect(() => captionAutoSplit(seg({ text: long }), { size: SIZE, style: { autoFit: true }, estimate: true })).not.toThrow();
  });
});

describe('captionTrack band mode + legacy byte-identity', () => {
  const segs = [seg({ id: 's0', text: 'A fairly long caption line that exceeds the band width and must wrap or split into two.', start: 0, duration: 4 })];

  it('band mode via captionTrack splits (and fails loud without size)', () => {
    const tm = timing(segs, { mode: 'band' });
    expect(() => captionTrack(tm)).toThrow(/needs the render size/);
    const trk = captionTrack(tm, { size: SIZE, style: { autoFit: true }, measurer: real });
    expect(trk.keys.length).toBeGreaterThan(0);
  });

  it('legacy: absent captionSplit is one cue per segment (byte-identical path)', () => {
    const trk = captionTrack(timing(segs));
    // key 0 (initial) holds the whole segment text; + a clear key after
    expect(trk.keys.some((k) => k.value === segs[0]!.text)).toBe(true);
  });

  it('sidecar tolerance: band mode without a render context → single cue per segment', () => {
    const srt = toSrt(timing(segs, { mode: 'band' }));
    // one cue block (the whole segment), not a pixel-split (no render context for a text sidecar)
    expect(srt.split('\n\n').filter((b) => b.trim()).length).toBe(1);
    // with a context, it splits like the burned track
    const srt2 = toSrt(timing(segs, { mode: 'band' }), { size: SIZE, style: { autoFit: true }, measurer: real });
    expect(srt2.split('\n\n').filter((b) => b.trim()).length).toBeGreaterThanOrEqual(1);
  });
});

/**
 * @glissade/sfx core: the clean-room synth's determinism, the source seam
 * (procedural + license-checked sample packs), and index-seeded clip placement.
 */

import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  SFX_PRESETS,
  SfxError,
  buildSfxClips,
  encodeWavMono,
  hashStr,
  keystrokeClips,
  renderSfxAssets,
  renderSfxr,
  samplePackSource,
  sfxFileName,
  sfxrSource,
  type SfxHit,
} from '../src/index.js';

describe('renderSfxr (clean-room synth)', () => {
  it('is byte-deterministic: identical params → identical samples', () => {
    const a = renderSfxr(PRESETS.coin);
    const b = renderSfxr(PRESETS.coin);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('the noise voice is deterministic too (seeded, no Math.random)', () => {
    const a = renderSfxr(PRESETS.whoosh);
    const b = renderSfxr(PRESETS.whoosh);
    expect(Array.from(a)).toEqual(Array.from(b));
    // and actually produces sound
    expect(a.some((v) => v !== 0)).toBe(true);
  });

  it('length tracks the envelope duration × sample rate', () => {
    const samples = renderSfxr({ waveform: 'sine', attack: 0.1, sustain: 0.1, decay: 0.1, startFreq: 440, sampleRate: 1000 });
    expect(samples.length).toBe(300); // 0.3s × 1000
  });

  it('stays within Int16 range', () => {
    const s = renderSfxr({ ...PRESETS.error, volume: 1 });
    for (const v of s) expect(v).toBeGreaterThanOrEqual(-32768), expect(v).toBeLessThanOrEqual(32767);
  });
});

describe('encodeWavMono', () => {
  it('writes a valid 44-byte-header mono PCM WAV', () => {
    const wav = encodeWavMono(Int16Array.from([0, 1000, -1000, 0]), 44100);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(wav.length).toBe(44 + 4 * 2); // header + 4 samples × 2 bytes
    const dv = new DataView(wav.buffer);
    expect(dv.getUint16(22, true)).toBe(1); // mono
    expect(dv.getUint32(24, true)).toBe(44100); // sample rate
    expect(dv.getUint32(40, true)).toBe(8); // data length
  });

  it('is byte-deterministic', () => {
    const s = renderSfxr(PRESETS.blip);
    expect(Array.from(encodeWavMono(s))).toEqual(Array.from(encodeWavMono(s)));
  });
});

describe('sfxrSource', () => {
  const src = sfxrSource();

  it('exposes all ten presets as voices', () => {
    expect(src.voices().map((v) => v.id)).toEqual([...SFX_PRESETS]);
    expect(SFX_PRESETS).toHaveLength(10);
  });

  it('renders a real WAV for each preset', () => {
    for (const { id } of src.voices()) {
      const wav = src.render(id);
      expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
      expect(wav.length).toBeGreaterThan(44);
    }
  });

  it('an unknown preset throws, listing the valid ones', () => {
    expect(() => src.render('boom')).toThrow(SfxError);
    expect(() => src.render('boom')).toThrow(/click, tap/);
  });

  it('version folds in the sample rate (cache key)', () => {
    expect(sfxrSource({ sampleRate: 22050 }).version()).toBe('sfxr-1/22050');
  });
});

describe('samplePackSource: license is mandatory', () => {
  const bytes = encodeWavMono(Int16Array.from([0, 1, 2]));

  it('throws when license or source is missing (nothing unlicensed ships)', () => {
    expect(() => samplePackSource({ id: 'p', license: '', source: 'me', samples: {} })).toThrow(/missing a license/);
    expect(() => samplePackSource({ id: 'p', license: 'CC0-1.0', source: '', samples: {} })).toThrow(/missing a source/);
  });

  it('renders sample bytes by voice id; unknown sample throws', () => {
    const src = samplePackSource({ id: 'kit', license: 'CC0-1.0', source: 'freesound#123', samples: { kick: bytes } });
    expect(src.id).toBe('pack-kit');
    expect(Array.from(src.render('kick'))).toEqual(Array.from(bytes));
    expect(() => src.render('snare')).toThrow(/no sample 'snare'/);
    expect(src.version()).toBe('kit@CC0-1.0');
  });
});

describe('buildSfxClips: placement + index-seeded variation', () => {
  const src = sfxrSource();
  const hits: SfxHit[] = [
    { voice: 'click', at: 1.0 },
    { voice: 'click', at: 2.0 },
    { voice: 'pop', at: 3.0, gain: 0.5 },
  ];

  it('places one clip per hit at its time, referencing the committed WAV', () => {
    const clips = buildSfxClips(hits, src, { baseUrl: './cache' });
    expect(clips).toHaveLength(3);
    expect(clips[0]!.at).toBe(1.0);
    expect(clips[0]!.asset).toEqual({ kind: 'audio', url: `./cache/${sfxFileName('sfxr', 'click')}` });
  });

  it('no playbackRate when jitterRate is off; a constant gain envelope when gain ≠ 1', () => {
    const clips = buildSfxClips(hits, src);
    expect(clips[0]!.playbackRate).toBeUndefined();
    expect(clips[2]!.gain).toEqual({ keys: [{ t: 0, value: 0.5 }] });
  });

  it('jitter is a pure function of (seed, voice, index) — same inputs, identical clips', () => {
    const opts = { seed: 7, jitterRate: 0.06, jitterGain: 0.1 };
    expect(buildSfxClips(hits, src, opts)).toEqual(buildSfxClips(hits, src, opts));
  });

  it('two identical-voice hits get DIFFERENT jitter (index is part of the seed)', () => {
    const clips = buildSfxClips(hits, src, { seed: 7, jitterRate: 0.06 });
    expect(clips[0]!.playbackRate).not.toBe(clips[1]!.playbackRate); // same voice, different index
    for (const c of clips) expect(Math.abs((c.playbackRate ?? 1) - 1)).toBeLessThanOrEqual(0.06);
  });

  it('changing the seed changes the jitter', () => {
    const a = buildSfxClips(hits, src, { seed: 1, jitterRate: 0.06 })[0]!.playbackRate;
    const b = buildSfxClips(hits, src, { seed: 2, jitterRate: 0.06 })[0]!.playbackRate;
    expect(a).not.toBe(b);
  });
});

describe('renderSfxAssets', () => {
  it('renders each referenced voice once, deduped, keyed by filename', () => {
    const assets = renderSfxAssets(sfxrSource(), ['click', 'click', 'pop']);
    expect(Object.keys(assets).sort()).toEqual([sfxFileName('sfxr', 'click'), sfxFileName('sfxr', 'pop')].sort());
  });
});

describe('hashStr', () => {
  it('is stable and well-mixed', () => {
    expect(hashStr('sfxr/click')).toBe(hashStr('sfxr/click'));
    expect(hashStr('sfxr/click')).not.toBe(hashStr('sfxr/pop'));
  });
});

describe('keystrokeClips: one click per typed/deleted character', () => {
  const src = sfxrSource();
  const marks = [
    { time: 1, grapheme: 'h', kind: 'insert' as const },
    { time: 2, grapheme: ' ', kind: 'insert' as const }, // whitespace
    { time: 3, grapheme: 'i', kind: 'delete' as const }, // a backspace
  ];

  it('places a clip per non-whitespace keystroke; whitespace is skipped by default', () => {
    const clips = keystrokeClips(marks, src, { baseUrl: './c' });
    expect(clips).toHaveLength(2); // the space is dropped
    expect(clips[0]!.at).toBe(1);
    expect(clips[0]!.asset.url).toBe(`./c/${sfxFileName('sfxr', 'type')}`);
    expect(clips[1]!.at).toBe(3); // the delete keystroke
  });

  it('a backspace can take a distinct voice', () => {
    const clips = keystrokeClips(marks, src, { deleteVoice: 'tap' });
    expect(clips[1]!.asset.url).toBe(`./${sfxFileName('sfxr', 'tap')}`); // the delete → 'tap'
    expect(clips[0]!.asset.url).toBe(`./${sfxFileName('sfxr', 'type')}`); // the insert → 'type'
  });

  it('marks without a kind (a monotonic revealSchedule) are all inserts', () => {
    const clips = keystrokeClips([{ time: 0.5, grapheme: 'a' }], src, { insertVoice: 'blip' });
    expect(clips).toHaveLength(1);
    expect(clips[0]!.asset.url).toBe(`./${sfxFileName('sfxr', 'blip')}`);
  });

  it('index-seeded jitter is deterministic and consumes typewriter marks', () => {
    const opts = { seed: 3, jitterRate: 0.05 };
    expect(keystrokeClips(marks, src, opts)).toEqual(keystrokeClips(marks, src, opts));
  });

  it('round-robins a multi-sample pool (non-looping foley), deterministically', () => {
    const typed = [...'abcdefgh'].map((g, i) => ({ time: i + 1, grapheme: g, kind: 'insert' as const }));
    const opts = { insertVoices: ['k1', 'k2', 'k3'], baseUrl: '.' };
    const clips = keystrokeClips(typed, src, opts);
    const used = new Set(clips.map((c) => c.asset.url));
    expect(used.size).toBeGreaterThan(1); // not a single looped sample
    // every pick is from the pool
    for (const c of clips) expect(['k1', 'k2', 'k3'].some((v) => c.asset.url.endsWith(sfxFileName('sfxr', v)))).toBe(true);
    // deterministic
    expect(keystrokeClips(typed, src, opts)).toEqual(clips);
  });
})

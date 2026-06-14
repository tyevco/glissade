/**
 * The prepare side: deterministic fake synthesis, the RIFF parser, and the
 * cache contract — unchanged segments never re-synthesize, changed ones
 * re-synthesize alone and re-flow downstream starts.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { NarrationError, type NarrationScript } from '../src/index.js';
import {
  alignerById,
  cacheKey,
  fakeProvider,
  heuristicAligner,
  heuristicWords,
  interpolateMissing,
  mapAsrToScript,
  piperProvider,
  providerById,
  scriptPathFor,
  synthesizeScript,
  voskAligner,
  wavDuration,
  type Aligner,
  type TtsProvider,
} from '../src/providers.js';

/** a real WAV (deterministic) but with the provider's word timings stripped */
function noWordsProvider(): TtsProvider {
  const fake = fakeProvider();
  return {
    id: 'nowords',
    version: () => Promise.resolve('nw-1'),
    synthesize: async (req) => {
      const r = await fake.synthesize(req);
      return { wav: r.wav, duration: r.duration };
    },
  };
}

const dir = mkdtempSync(join(tmpdir(), 'glissade-narrate-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const SCRIPT: NarrationScript = {
  narrationVersion: 1,
  provider: 'fake',
  leadIn: 0.2,
  gap: 0.3,
  segments: [
    { id: 'one', text: 'Hello there world.' },
    { id: 'two', text: 'Captions are plain data.' },
    { id: 'three', text: 'Goodbye.' },
  ],
};

function writeScript(name: string, script: NarrationScript): string {
  const p = join(dir, `${name}.narration.json`);
  writeFileSync(p, JSON.stringify(script, null, 2));
  return p;
}

describe('fakeProvider', () => {
  it('is a pure function of the request: identical bytes across calls', async () => {
    const fake = fakeProvider();
    const a = await fake.synthesize({ text: 'Determinism or bust.' });
    const b = await fake.synthesize({ text: 'Determinism or bust.' });
    expect(a.wav.equals(b.wav)).toBe(true);
    expect(a.duration).toBe(b.duration);
    expect(wavDuration(a.wav)).toBeCloseTo(a.duration, 6);
  });

  it('models reading speed and respects rate', async () => {
    const fake = fakeProvider();
    const slow = await fake.synthesize({ text: 'one two three four five six' });
    const fast = await fake.synthesize({ text: 'one two three four five six', rate: 2 });
    expect(slow.duration).toBeGreaterThan(fast.duration);
    expect(slow.words).toHaveLength(6);
    expect(slow.words![5]!.end).toBeCloseTo(slow.duration, 6);
  });
});

describe('wavDuration', () => {
  it('rejects non-RIFF input', () => {
    expect(() => wavDuration(Buffer.from('not a wav file at all, sorry!!!!!!!!!!!!!!!!'))).toThrow(
      NarrationError,
    );
  });
});

describe('providerById', () => {
  it('rejects unknown providers, listing the real ones', () => {
    expect(() => providerById('elevenlabs')).toThrow(/fake, espeak, piper, openai/);
  });
});

describe('piperProvider (feature-detected, like espeak/openai)', () => {
  it('version(): present → string incl. the noise mode (cache key); absence (ENOENT) throws', async () => {
    // env-robust: piper-tts 1.x exits non-zero with no --version, so detection
    // gates on spawn ENOENT, not exit code. Present (e.g. this box) → a version
    // string carrying the noise mode (deterministic 0/0 by default); absent
    // (e.g. CI) → a clear error naming both install paths.
    try {
      expect(await piperProvider().version()).toMatch(/piper.*noise=0\/0/s);
      // a different noise mode → different cache key → re-synthesis
      expect(await piperProvider({ noiseScale: 0.5, noiseWScale: 0.8 }).version()).toMatch(/noise=0\.5\/0\.8/);
    } catch (e) {
      expect((e as Error).message).toMatch(/piper not found.*pip install piper-tts/s);
    }
  });

  it('synthesize needs a model', () => {
    expect(() => piperProvider().synthesize({ text: 'hi' })).toThrow(/needs a voice model/);
  });
});

describe('heuristicWords / heuristicAligner', () => {
  it('distributes words across the duration; spans sum to it exactly', () => {
    const words = heuristicWords('Captions are plain data', 4);
    expect(words.map((w) => w.word)).toEqual(['Captions', 'are', 'plain', 'data']);
    expect(words[0]!.start).toBe(0);
    expect(words[words.length - 1]!.end).toBeCloseTo(4, 9);
    for (let i = 1; i < words.length; i++) expect(words[i]!.start).toBeCloseTo(words[i - 1]!.end, 9);
  });

  it('weights by syllables, not characters — a 3-syllable word gets more than a 1-syllable one', () => {
    const [animation, of] = heuristicWords('animation of', 2);
    expect(animation!.end - animation!.start).toBeGreaterThan((of!.end - of!.start) * 2);
  });

  it('is a pure function (same text + duration → identical timings)', () => {
    expect(heuristicWords('one two three', 3)).toEqual(heuristicWords('one two three', 3));
  });

  it('the aligner reads its duration from the wav bytes', async () => {
    const wav = (await fakeProvider().synthesize({ text: 'one two' })).wav;
    const words = await heuristicAligner().align({ wav, text: 'one two' });
    expect(words[words.length - 1]!.end).toBeCloseTo(wavDuration(wav), 9);
  });
});

describe('alignerById', () => {
  it("'none' disables; unknown throws; ids resolve", () => {
    expect(alignerById('none')).toBeNull();
    expect(alignerById('heuristic')!.id).toBe('heuristic');
    expect(alignerById('vosk')!.id).toBe('vosk');
    expect(() => alignerById('aeneas')).toThrow(/heuristic, vosk, none/);
  });
});

describe('voskAligner (shells out to a `vosk-align` command, feature-detected)', () => {
  it('version(): present command → a string; a missing command (ENOENT) throws', async () => {
    // env-robust: with vosk-align on PATH (the vosk flake) → present; without
    // it → a clear error naming the contract. The aligner never touches the
    // broken npm `vosk`/ffi-napi binding.
    try {
      expect(await voskAligner().version()).toMatch(/vosk/);
    } catch (e) {
      expect((e as Error).message).toMatch(/not found.*vosk-align command/s);
    }
  });

  it('a definitely-absent command throws ENOENT, not a silent pass', () => {
    expect(() => voskAligner({ command: '/no/such/vosk-align-xyz' }).version()).toThrow(/not found/);
  });
});

describe('mapAsrToScript / interpolateMissing (the shared alignment core)', () => {
  it('maps clean forced-aligner words 1:1 onto the script tokens', () => {
    const timed = [
      { word: 'Captions', start: 0, end: 0.5 },
      { word: 'are', start: 0.5, end: 0.7 },
      { word: 'data', start: 0.7, end: 1.2 },
    ];
    const out = mapAsrToScript(timed, 'Captions are data');
    expect(out).toEqual(timed);
  });

  it('normalizes punctuation/case when matching (script "data." ↔ asr "data")', () => {
    const timed = [{ word: 'data', start: 1, end: 2 }];
    const out = mapAsrToScript(timed, 'Data.');
    expect(out).toEqual([{ word: 'Data.', start: 1, end: 2 }]);
  });

  it('interpolates script words the aligner did not time (ASR drift on numbers)', () => {
    // ASR spelled the number out → '$48,200' has no normalized match → interpolated
    const timed = [
      { word: 'budget', start: 0, end: 1 },
      { word: 'forty', start: 1, end: 1.3 },
      { word: 'eight', start: 1.3, end: 1.6 },
      { word: 'thousand', start: 1.6, end: 2 },
      { word: 'approved', start: 2, end: 3 },
    ];
    const out = mapAsrToScript(timed, 'budget $48,200 approved');
    expect(out.map((w) => w.word)).toEqual(['budget', '$48,200', 'approved']);
    // the middle word sits between its timed neighbours, monotonic
    expect(out[1]!.start).toBeCloseTo(1, 9); // budget.end
    expect(out[1]!.end).toBeCloseTo(2, 9); // approved.start
    for (let i = 1; i < out.length; i++) expect(out[i]!.start).toBeGreaterThanOrEqual(out[i - 1]!.start);
  });

  it('falls back to syllable distribution when nothing matches', () => {
    const timed = [{ word: 'zzz', start: 2, end: 5 }]; // matches no script word
    const out = mapAsrToScript(timed, 'one two three');
    expect(out.map((w) => w.word)).toEqual(['one', 'two', 'three']);
    expect(out[0]!.start).toBeCloseTo(2, 9); // distributed over the timed span [2,5]
    expect(out[out.length - 1]!.end).toBeCloseTo(5, 9);
  });

  it('interpolateMissing fills NaN runs between known anchors; edges clamp', () => {
    const filled = interpolateMissing([
      { word: 'a', start: 0, end: 1 },
      { word: 'b', start: NaN, end: NaN },
      { word: 'c', start: NaN, end: NaN },
      { word: 'd', start: 4, end: 5 },
    ]);
    expect(filled[1]!.start).toBeCloseTo(1, 9);
    expect(filled[2]!.end).toBeCloseTo(4, 9);
    expect(filled.every((w) => !Number.isNaN(w.start))).toBe(true);
  });
});

describe('synthesizeScript: the alignment pipeline', () => {
  const NW = noWordsProvider;

  it('a word-less provider gets words from the aligner (and reports which segments)', async () => {
    const scriptPath = writeScript('align-fill', SCRIPT);
    const r = await synthesizeScript(scriptPath, { providerImpl: NW(), alignerImpl: heuristicAligner() });
    expect(r.aligner).toBe('heuristic');
    expect(r.aligned).toEqual(['one', 'two', 'three']);
    expect(r.timing.segments[0]!.words!.length).toBeGreaterThan(0);
    // words are absolute (offset by the segment start = leadIn 0.2)
    expect(r.timing.segments[0]!.words![0]!.start).toBeCloseTo(0.2, 9);
  });

  it('provider words WIN — alignment is skipped when the provider supplies them', async () => {
    const scriptPath = writeScript('align-skip', SCRIPT);
    const r = await synthesizeScript(scriptPath, { providerImpl: fakeProvider(), alignerImpl: heuristicAligner() });
    expect(r.aligned).toEqual([]); // fake gives words; aligner untouched
    expect(r.timing.segments[0]!.words!.length).toBeGreaterThan(0);
  });

  it("align: 'none' leaves segments word-less", async () => {
    const scriptPath = writeScript('align-none', SCRIPT);
    const r = await synthesizeScript(scriptPath, { providerImpl: NW(), alignerImpl: null });
    expect(r.aligned).toEqual([]);
    expect(r.timing.segments[0]!.words).toBeUndefined();
  });

  it('a changed aligner re-derives words from the CACHED wav — no re-synthesis', async () => {
    const constAligner = (): Aligner => ({
      id: 'constal',
      version: () => Promise.resolve('c-1'),
      align: (req) => Promise.resolve([{ word: 'X', start: 0, end: wavDuration(req.wav) }]),
    });
    const scriptPath = writeScript('align-swap', SCRIPT);

    const first = await synthesizeScript(scriptPath, { providerImpl: NW(), alignerImpl: heuristicAligner() });
    expect(first.synthesized).toEqual(['one', 'two', 'three']);

    // swap the aligner: wavs are cached (synthesized empty), but words re-derive
    const second = await synthesizeScript(scriptPath, { providerImpl: NW(), alignerImpl: constAligner() });
    expect(second.synthesized).toEqual([]);
    expect(second.reused).toEqual(['one', 'two', 'three']);
    expect(second.aligned).toEqual(['one', 'two', 'three']);
    expect(second.timing.segments[0]!.words).toHaveLength(1); // the const aligner's one word

    // same aligner again: cached alignment reused, nothing re-aligned
    const third = await synthesizeScript(scriptPath, { providerImpl: NW(), alignerImpl: constAligner() });
    expect(third.aligned).toEqual([]);
    expect(third.timing.segments[0]!.words).toHaveLength(1);
  });
});

describe('synthesizeScript: the cache contract', () => {
  it('first run synthesizes everything; outputs are committable JSON', async () => {
    const scriptPath = writeScript('basic', SCRIPT);
    const r = await synthesizeScript(scriptPath);
    expect(r.synthesized).toEqual(['one', 'two', 'three']);
    expect(r.reused).toEqual([]);
    expect(r.timing.segments[0]!.start).toBe(0.2); // leadIn
    // gap flows: two starts at one.end + 0.3
    const [s1, s2] = r.timing.segments;
    expect(s2!.start).toBeCloseTo(s1!.start + s1!.duration + 0.3, 9);
    const cache = JSON.parse(readFileSync(join(r.cacheDir, 'cache.json'), 'utf8')) as {
      entries: Record<string, string>;
    };
    expect(Object.keys(cache.entries)).toHaveLength(3);
  });

  it('second run reuses everything and is byte-stable', async () => {
    const scriptPath = writeScript('stable', SCRIPT);
    const r1 = await synthesizeScript(scriptPath);
    const timing1 = readFileSync(r1.timingPath);
    const wav1 = readFileSync(join(r1.cacheDir, r1.timing.segments[0]!.file));
    const r2 = await synthesizeScript(scriptPath);
    expect(r2.synthesized).toEqual([]);
    expect(r2.reused).toEqual(['one', 'two', 'three']);
    expect(readFileSync(r2.timingPath).equals(timing1)).toBe(true);
    expect(readFileSync(join(r2.cacheDir, r2.timing.segments[0]!.file)).equals(wav1)).toBe(true);
    // word timestamps survive reuse — they are persisted in the cache manifest
    expect(r2.timing.segments[0]!.words).toEqual(r1.timing.segments[0]!.words);
    expect(r2.timing.segments[0]!.words!.length).toBeGreaterThan(0);
  });

  it('changing ONE segment re-synthesizes exactly that one and re-flows later starts', async () => {
    const scriptPath = writeScript('edit', SCRIPT);
    const before = await synthesizeScript(scriptPath);
    const edited: NarrationScript = {
      ...SCRIPT,
      segments: [
        SCRIPT.segments[0]!,
        { id: 'two', text: 'Captions are plain data, and considerably longer now than before.' },
        SCRIPT.segments[2]!,
      ],
    };
    writeFileSync(scriptPath, JSON.stringify(edited, null, 2));
    const after = await synthesizeScript(scriptPath);
    expect(after.synthesized).toEqual(['two']);
    expect(after.reused).toEqual(['one', 'three']);
    // segment one is untouched; three re-flows later because two grew
    expect(after.timing.segments[0]!.start).toBe(before.timing.segments[0]!.start);
    expect(after.timing.segments[1]!.duration).toBeGreaterThan(before.timing.segments[1]!.duration);
    expect(after.timing.segments[2]!.start).toBeGreaterThan(before.timing.segments[2]!.start);
  });

  it('--force re-synthesizes every segment', async () => {
    const scriptPath = writeScript('force', SCRIPT);
    await synthesizeScript(scriptPath);
    const r = await synthesizeScript(scriptPath, { force: true });
    expect(r.synthesized).toEqual(['one', 'two', 'three']);
  });

  it('rejects duplicate segment ids and bad versions', async () => {
    const dup = writeScript('dup', {
      ...SCRIPT,
      segments: [
        { id: 'x', text: 'a' },
        { id: 'x', text: 'b' },
      ],
    });
    await expect(synthesizeScript(dup)).rejects.toThrow(/duplicate segment id 'x'/);
    const bad = join(dir, 'bad.narration.json');
    writeFileSync(bad, JSON.stringify({ narrationVersion: 2, segments: [] }));
    await expect(synthesizeScript(bad)).rejects.toThrow(/narrationVersion/);
  });
});

describe('scriptPathFor', () => {
  it('passes a script path through and resolves a scene module to its sibling', () => {
    const scriptPath = writeScript('scene', SCRIPT);
    expect(scriptPathFor(scriptPath)).toBe(scriptPath);
    expect(scriptPathFor(join(dir, 'scene.ts'))).toBe(scriptPath);
    expect(() => scriptPathFor(join(dir, 'missing.ts'))).toThrow(/no narration script/);
  });
});

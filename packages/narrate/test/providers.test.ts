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
  cacheKey,
  fakeProvider,
  providerById,
  scriptPathFor,
  synthesizeScript,
  wavDuration,
} from '../src/providers.js';

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
    expect(() => providerById('elevenlabs')).toThrow(/fake, espeak, openai/);
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

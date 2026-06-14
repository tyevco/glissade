/**
 * gs prepare: materializes the sfx manifest + cache AND flushes in-code caches
 * by importing the scene module (its top-level side effects run), with no
 * evaluate() (which is pure and writes nothing). Idempotent.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { prepareCommand } from '../src/prepare.js';

const dir = mkdtempSync(join(tmpdir(), 'glissade-prepare-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** a minimal valid scene module that writes a marker file at IMPORT time */
function sceneSrc(markerPath: string): string {
  return `import { writeFileSync } from 'node:fs';
import { createScene } from '@glissade/scene';
import { timeline } from '@glissade/core';
writeFileSync(${JSON.stringify(markerPath)}, 'flushed'); // in-code cache stand-in (module-level)
export default {
  createScene: () => createScene({ size: { w: 16, h: 16 }, children: [] }),
  timeline: timeline({ fps: 30, duration: 1, tracks: [] }),
};
`;
}

describe('prepareCommand', () => {
  it('materializes a sibling .sfx.json AND flushes in-code caches via module import', async () => {
    const base = join(dir, 'fx');
    writeFileSync(`${base}.ts`, sceneSrc(`${base}.flushed`));
    writeFileSync(`${base}.sfx.json`, JSON.stringify({ sfxVersion: 1, hits: [{ voice: 'pop', at: 0.5 }, { voice: 'click', at: 1 }] }));

    const r = await prepareCommand({ input: `${base}.ts` });
    expect(r.sfx).not.toBeNull();
    expect(existsSync(`${base}.sfx.timing.json`)).toBe(true);
    expect(existsSync(join(`${base}.sfx-cache`, 'sfxr-pop.wav'))).toBe(true);
    expect(r.loaded).toBe(true);
    expect(existsSync(`${base}.flushed`)).toBe(true); // the module's import side effect ran
  });

  it('is idempotent: two runs yield byte-identical manifest + cache', async () => {
    const base = join(dir, 'idem');
    writeFileSync(`${base}.ts`, sceneSrc(`${base}.flushed`));
    writeFileSync(
      `${base}.sfx.json`,
      JSON.stringify({ sfxVersion: 1, seed: 5, jitterRate: 0.05, hits: [{ voice: 'type', at: 0.2 }, { voice: 'type', at: 0.4 }] }),
    );
    await prepareCommand({ input: `${base}.ts` });
    const timing1 = readFileSync(`${base}.sfx.timing.json`);
    const wav1 = readFileSync(join(`${base}.sfx-cache`, 'sfxr-type.wav'));

    await prepareCommand({ input: `${base}.ts` });
    expect(readFileSync(`${base}.sfx.timing.json`).equals(timing1)).toBe(true);
    expect(readFileSync(join(`${base}.sfx-cache`, 'sfxr-type.wav')).equals(wav1)).toBe(true);
  });

  it('no siblings: still succeeds (just imports the module)', async () => {
    const base = join(dir, 'bare');
    writeFileSync(`${base}.ts`, sceneSrc(`${base}.flushed`));
    const r = await prepareCommand({ input: `${base}.ts` });
    expect(r.sfx).toBeNull();
    expect(r.narrationTimingPath).toBeNull();
    expect(r.loaded).toBe(true);
    expect(existsSync(`${base}.flushed`)).toBe(true);
  });
});

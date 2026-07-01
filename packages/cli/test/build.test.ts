/**
 * gs build (0.29): the DAG runner orchestration. A fixture project + a recording
 * stub step-executor (which simulates each step producing its output) proves the
 * end-to-end behavior WITHOUT a TTS venv / ffmpeg: first build runs everything,
 * a no-change rebuild skips everything, a per-scene source edit re-runs only that
 * scene's downstream, and --explain runs nothing.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCommand, hashInputs, stepInputs, stepOutput, type BuildDeps } from '../src/build.js';

let root: string;
let calls: string[];

/** A stub executor: records the call and writes the step's output as a deterministic
 *  function of its inputs — so downstream inputs change exactly when an upstream re-runs. */
const recorder: BuildDeps = {
  runStep: async (scene, step, _cfg, videoPath) => {
    calls.push(`${basename(scene)}:${step}`);
    writeFileSync(stepOutput(scene, step, videoPath), hashInputs(stepInputs(scene, step), 'stub'));
  },
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gs-build-'));
  calls = [];
  writeFileSync(join(root, 'glissade.config.ts'), `export default { scenes: ['e01.ts', 'e02.ts'] };\n`);
  for (const e of ['e01', 'e02']) {
    writeFileSync(join(root, `${e}.ts`), `// scene ${e}\nexport default {};\n`);
    writeFileSync(join(root, `${e}.narration.json`), JSON.stringify({ segments: [{ id: 's1', text: `hi ${e}` }] }));
  }
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const config = () => join(root, 'glissade.config.ts');

describe('gs build — DAG runner', () => {
  it('first build runs the applicable steps for every scene', async () => {
    const r = await buildCommand({ config: config() }, recorder);
    expect(r.scenes).toBe(2);
    // narration present, no sfx → [narrate, measure-loudness, render] × 2 scenes
    expect(calls.sort()).toEqual([
      'e01.ts:measure-loudness', 'e01.ts:narrate', 'e01.ts:render',
      'e02.ts:measure-loudness', 'e02.ts:narrate', 'e02.ts:render',
    ]);
    expect(r.ran).toBe(6);
    expect(r.skipped).toBe(0);
  });

  it('a no-change rebuild skips everything', async () => {
    await buildCommand({ config: config() }, recorder);
    calls = [];
    const r = await buildCommand({ config: config() }, recorder);
    expect(calls).toEqual([]); // nothing re-run
    expect(r.ran).toBe(0);
    expect(r.skipped).toBe(6);
  });

  it('editing ONE scene\'s narration re-runs only that scene\'s downstream (per-asset isolation)', async () => {
    await buildCommand({ config: config() }, recorder);
    calls = [];
    // change e01's narration source only
    writeFileSync(join(root, 'e01.narration.json'), JSON.stringify({ segments: [{ id: 's1', text: 'CHANGED' }] }));
    const r = await buildCommand({ config: config() }, recorder);
    expect(calls.sort()).toEqual(['e01.ts:measure-loudness', 'e01.ts:narrate', 'e01.ts:render']); // e01 only
    expect(calls.some((c) => c.startsWith('e02'))).toBe(false); // e02 untouched
    expect(r.ran).toBe(3);
    expect(r.skipped).toBe(3);
  });

  it('--explain runs nothing (prints the plan, no manifest write)', async () => {
    const r = await buildCommand({ config: config(), explain: true }, recorder);
    expect(calls).toEqual([]); // runStep never called
    expect(r.ran).toBe(6); // WOULD run
    // a real (non-explain) build afterward still sees everything as unbuilt → runs all
    calls = [];
    const r2 = await buildCommand({ config: config() }, recorder);
    expect(r2.ran).toBe(6);
  });

  it('a filter restricts to matching scenes (gs build e01)', async () => {
    const r = await buildCommand({ config: config(), only: ['e01'] }, recorder);
    expect(r.scenes).toBe(1);
    expect(calls.every((c) => c.startsWith('e01'))).toBe(true);
  });
});

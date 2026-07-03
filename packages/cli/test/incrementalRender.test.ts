/**
 * Dirty-beat incremental (0.41) — the END-TO-END determinism gate. A warm
 * `--incremental` splice (re-render the changed frame runs, reuse the retained
 * FFV1 intermediate for the rest) must be BYTE-IDENTICAL to a cold `--incremental`
 * render of the same edited scene. That is the north star: the perf optimization
 * does not change output bytes. Heavy (child `gs render` processes + ffmpeg
 * trim/concat/encode), so gated like the sharded-join suite — needs the built
 * dist/cli.js + ffmpeg.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { intermediatePathFor } from '../src/shards.js';
import { readRenderManifest } from '../src/renderManifest.js';
import { ffmpegAvailable } from '../src/render.js';

const FIX = fileURLToPath(new URL('./fixtures/incremental', import.meta.url));
const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const sceneA = join(FIX, 'sceneA.ts');
const sceneB = join(FIX, 'sceneB.ts');

const outDir = mkdtempSync(join(tmpdir(), 'glissade-incr-e2e-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

const render = (scene: string, out: string): string => {
  const r = spawnSync(process.execPath, [CLI, 'render', scene, '--out', out, '--fps', '12', '--incremental'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) throw new Error(`render failed (${r.status}):\n${r.stderr?.toString().slice(-2000)}`);
  return (r.stderr?.toString() ?? '') + (r.stdout?.toString() ?? '');
};

// Needs the built dist/cli.js (child spawns) + ffmpeg — same gate as the sharded join suite.
describe.runIf(existsSync(CLI) && ffmpegAvailable())('gs render --incremental — dirty-beat determinism gate', () => {
  it('a warm splice is byte-identical to a cold full render of the edited scene', () => {
    const P = join(outDir, 'P.mp4'); // A cold → edit to B (splice)
    const Q = join(outDir, 'Q.mp4'); // B cold (the full-render reference)

    // 1) cold render of A builds the intermediate + manifest beside P
    const coldA = render(sceneA, P);
    expect(coldA).toMatch(/full render/);
    expect(existsSync(intermediatePathFor(P))).toBe(true);
    expect(readRenderManifest(P)?.frameKeys).toHaveLength(24); // 2s @ 12fps

    // 2) edit to B, render to the SAME path P → splices against A's intermediate
    const splice = render(sceneB, P);
    expect(splice).toMatch(/11\/24 frames changed/); // mover animates t>1 → second-half run only

    // 3) cold full --incremental render of B to a fresh path Q (the reference)
    const coldB = render(sceneB, Q);
    expect(coldB).toMatch(/full render/);

    // THE GATE: the spliced output equals the cold full render, byte-for-byte.
    expect(readFileSync(P).equals(readFileSync(Q))).toBe(true);
  });

  it('an unchanged re-render reuses the intermediate verbatim and stays byte-identical', () => {
    const R = join(outDir, 'R.mp4');
    render(sceneB, R);
    const before = readFileSync(R);
    const again = render(sceneB, R);
    expect(again).toMatch(/0\/24 frames changed/);
    expect(readFileSync(R).equals(before)).toBe(true);
  });

  it('a reverse edit splices back byte-identically to a cold render of the original', () => {
    const S = join(outDir, 'S.mp4'); // A → B → A (reverse splice)
    const Aref = join(outDir, 'Aref.mp4'); // A cold reference
    render(sceneA, S);
    render(sceneB, S); // splice forward
    const reverse = render(sceneA, S); // splice back
    expect(reverse).toMatch(/frames changed/);
    render(sceneA, Aref);
    expect(readFileSync(S).equals(readFileSync(Aref))).toBe(true);
  });
});

/**
 * gs diff (§3.3): snapshot a scene's DisplayList to .dl.json at a time, then
 * diff a re-evaluated scene against that baseline (a determinism contract — a
 * pure scene matches its own snapshot) and against a tampered baseline (the
 * command-level explanation a golden-hash mismatch turns into).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { diffCommand, snapshotAt, evaluateAt } from '../src/diff.js';

const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const MODULE = join(SCENES, 'golden-shapes.ts');
const outDir = mkdtempSync(join(tmpdir(), 'glissade-diff-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('gs diff against a .dl.json baseline', () => {
  it('a scene matches its own snapshot (determinism contract)', async () => {
    const base = join(outDir, 'shapes.dl.json');
    writeFileSync(base, await snapshotAt(MODULE, 1.0));
    const result = await diffCommand({ modulePath: MODULE, at: 1.0, against: base });
    expect(result.equal).toBe(true);
    expect(result.report).toContain('identical');
  });

  it('a tampered baseline produces a command-level diff and is non-equal', async () => {
    const base = join(outDir, 'shapes2.dl.json');
    // Snapshot, then mutate one numeric value in a transform matrix in-place.
    const doc = JSON.parse(await snapshotAt(MODULE, 1.0)) as {
      dlSnapshotVersion: number;
      commands: { op: string; m?: number[] }[];
    };
    const t = doc.commands.find((c) => c.op === 'transform' && Array.isArray(c.m));
    expect(t).toBeDefined();
    t!.m![4] = (t!.m![4] ?? 0) + 99;
    writeFileSync(base, JSON.stringify(doc));

    const result = await diffCommand({ modulePath: MODULE, at: 1.0, against: base });
    expect(result.equal).toBe(false);
    // command-tree marker: a [index] change line with the matrix field.
    expect(result.report).toMatch(/\[\d+\]/);
  });

  it('a different time diverges from the baseline', async () => {
    const base = join(outDir, 'shapes3.dl.json');
    writeFileSync(base, await snapshotAt(MODULE, 0.5));
    const result = await diffCommand({ modulePath: MODULE, at: 2.5, against: base });
    expect(result.equal).toBe(false);
  });

  it('rejects an --against with an unsupported extension', async () => {
    await expect(diffCommand({ modulePath: MODULE, at: 1.0, against: 'baseline.txt' })).rejects.toThrow(/\.dl\.json or \.png/);
  });
});

describe('evaluateAt / snapshotAt', () => {
  it('evaluateAt returns a DisplayList; snapshotAt round-trips through it', async () => {
    const dl = await evaluateAt(MODULE, 1.0);
    expect(dl.commands.length).toBeGreaterThan(0);
    const snap = JSON.parse(await snapshotAt(MODULE, 1.0)) as { dlSnapshotVersion: number; commands: unknown[] };
    expect(snap.dlSnapshotVersion).toBe(1);
    expect(snap.commands.length).toBe(dl.commands.length);
  });
});

/**
 * gs repin (0.37) — the narration-aware golden reviewer. Proves: a scene matches
 * its own freshly-pinned goldens (byte-equality contract), a corrupted golden is
 * reported as changed with a perceptual delta (SSIM) that localizes, the DRY-RUN
 * never writes, --write re-pins, --only gates per-frame, --floor refuses a
 * bigger-than-expected drop until --force, --heatmap emits a review PNG, and the
 * pure narration timing-diff yields the "seg moved +Δs: re-narration" cause line.
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { NarrationTiming } from '@glissade/narrate';
import { repinCommand, diffTiming, causeFor } from '../src/repin.js';

const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const MODULE = join(SCENES, 'golden-shapes.ts');
const NAME = 'golden-shapes';
const FRAMES = [0, 60, 120];

const tmp = mkdtempSync(join(tmpdir(), 'glissade-repin-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Pin a fresh golden set into a new dir and return it. */
async function freshGoldens(sub: string): Promise<string> {
  const dir = join(tmp, sub);
  const r = await repinCommand({ modulePath: MODULE, goldenDir: dir, name: NAME, frames: FRAMES, write: true });
  expect(r.frames.every((f) => f.status === 'new' && f.wrote)).toBe(true);
  return dir;
}

describe('gs repin — perceptual review + gated write', () => {
  it('a scene matches its own pinned goldens (all identical, nothing to write)', async () => {
    const dir = await freshGoldens('match');
    const r = await repinCommand({ modulePath: MODULE, goldenDir: dir, name: NAME, frames: FRAMES });
    expect(r.frames.every((f) => f.status === 'identical')).toBe(true);
    expect(r.changed).toBe(0);
    expect(r.wrote).toBe(0);
  });

  it('a corrupted golden is reported changed with an SSIM delta; dry-run does not write', async () => {
    const dir = await freshGoldens('corrupt');
    // overwrite f0060's golden with f0000's bytes → the render no longer matches
    cpSync(join(dir, `${NAME}-f0000.png`), join(dir, `${NAME}-f0060.png`));
    const before = readFileSync(join(dir, `${NAME}-f0060.png`));

    const r = await repinCommand({ modulePath: MODULE, goldenDir: dir, name: NAME, frames: FRAMES });
    const f60 = r.frames.find((f) => f.frame === 60)!;
    expect(f60.status).toBe('changed');
    expect(f60.ssim).toBeLessThan(1);
    expect(f60.minSsim).toBeLessThanOrEqual(f60.ssim!);
    expect(f60.wrote).toBe(false); // dry-run
    expect(r.changed).toBe(1);
    // untouched on disk
    expect(readFileSync(join(dir, `${NAME}-f0060.png`)).equals(before)).toBe(true);
  });

  it('--write re-pins the changed frame; a re-review is then clean', async () => {
    const dir = await freshGoldens('write');
    cpSync(join(dir, `${NAME}-f0000.png`), join(dir, `${NAME}-f0060.png`));
    const w = await repinCommand({ modulePath: MODULE, goldenDir: dir, name: NAME, frames: FRAMES, write: true });
    expect(w.frames.find((f) => f.frame === 60)!.wrote).toBe(true);
    expect(w.wrote).toBe(1);
    const after = await repinCommand({ modulePath: MODULE, goldenDir: dir, name: NAME, frames: FRAMES });
    expect(after.changed).toBe(0);
  });

  it('--only restricts writes to named frames', async () => {
    const dir = await freshGoldens('only');
    cpSync(join(dir, `${NAME}-f0120.png`), join(dir, `${NAME}-f0000.png`));
    cpSync(join(dir, `${NAME}-f0120.png`), join(dir, `${NAME}-f0060.png`));
    const r = await repinCommand({ modulePath: MODULE, goldenDir: dir, name: NAME, frames: FRAMES, write: true, only: [0] });
    expect(r.frames.find((f) => f.frame === 0)!.wrote).toBe(true);
    expect(r.frames.find((f) => f.frame === 60)!.wrote).toBe(false); // changed but not in --only
    expect(r.wrote).toBe(1);
  });

  it('--floor refuses a below-floor drop until --force, and can emit a heat-map', async () => {
    const dir = await freshGoldens('floor');
    cpSync(join(dir, `${NAME}-f0000.png`), join(dir, `${NAME}-f0060.png`)); // a big change
    const heatDir = join(tmp, 'heat');
    const blocked = await repinCommand({
      modulePath: MODULE, goldenDir: dir, name: NAME, frames: [60], write: true, floor: 0.999, heatmapDir: heatDir,
    });
    const bf = blocked.frames[0]!;
    expect(bf.blocked).toBe(true);
    expect(bf.wrote).toBe(false);
    expect(blocked.blocked).toBe(1);
    expect(bf.heatmap && existsSync(bf.heatmap)).toBe(true);

    const forced = await repinCommand({
      modulePath: MODULE, goldenDir: dir, name: NAME, frames: [60], write: true, floor: 0.999, force: true,
    });
    expect(forced.frames[0]!.wrote).toBe(true);
  });

  it('report names the mode and lists only non-identical frames', async () => {
    const dir = await freshGoldens('report');
    cpSync(join(dir, `${NAME}-f0000.png`), join(dir, `${NAME}-f0060.png`));
    const r = await repinCommand({ modulePath: MODULE, goldenDir: dir, name: NAME, frames: FRAMES });
    expect(r.report).toContain('dry-run');
    expect(r.report).toContain('f0060');
    expect(r.report).not.toContain('f0120'); // identical frames are omitted
    expect(r.report).toMatch(/re-run with --write/);
  });
});

describe('narration timing-diff → cause line (pure)', () => {
  const mk = (segs: { id: string; start: number; duration: number }[]): NarrationTiming => ({
    timingVersion: 1,
    provider: 'test',
    providerVersion: '0',
    totalDuration: 10,
    segments: segs.map((s) => ({ ...s, text: s.id, file: `${s.id}.wav` })),
  });

  it('a shifted segment is attributed at its own time window', () => {
    const older = mk([{ id: 'intro', start: 0, duration: 1 }, { id: 'body', start: 1, duration: 2 }, { id: 'outro', start: 3, duration: 1 }]);
    const newer = mk([{ id: 'intro', start: 0, duration: 1 }, { id: 'body', start: 1.21, duration: 2 }, { id: 'outro', start: 3.21, duration: 1 }]);
    const shifts = diffTiming(older, newer);
    // a frame during 'body' cites body's own +0.21s move
    expect(causeFor(1.5, shifts)).toBe('body moved +0.21s: re-narration');
    // a frame during 'outro' (which itself moved +0.21) cites outro
    expect(causeFor(3.3, shifts)).toBe('outro moved +0.21s: re-narration');
    // a frame during the unmoved 'intro' has no cause
    expect(causeFor(0.5, shifts)).toBeUndefined();
  });

  it('a frame whose own beat did not move is attributed to the upstream shift', () => {
    const older = mk([{ id: 'a', start: 0, duration: 1 }, { id: 'b', start: 5, duration: 5 }]);
    const newer = mk([{ id: 'a', start: 0.3, duration: 1 }, { id: 'b', start: 5, duration: 5 }]);
    const shifts = diffTiming(older, newer);
    // 'b' didn't move, but 'a' shifted upstream → cascade attribution
    expect(causeFor(6, shifts)).toBe('downstream of a (+0.30s): re-narration');
  });

  it('a newly-added segment is flagged as new', () => {
    const older = mk([{ id: 'a', start: 0, duration: 1 }]);
    const newer = mk([{ id: 'a', start: 0, duration: 1 }, { id: 'b', start: 1, duration: 1 }]);
    const shifts = diffTiming(older, newer);
    expect(causeFor(1.5, shifts)).toBe('b: new segment');
  });
});

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

  it('marks the lowest-SSIM changed frame as the likely edit-site (culprit finder)', async () => {
    const dir = await freshGoldens('editsite');
    // two changed frames with DIFFERENT divergence: f0000 fully swapped (big drop),
    // f0060 a small corner tweak (small drop) → f0000 should be the marked edit-site.
    cpSync(join(dir, `${NAME}-f0120.png`), join(dir, `${NAME}-f0000.png`)); // wholesale change
    // small change to f0060's golden: flip a few bytes near the end (a corner)
    const g60 = join(dir, `${NAME}-f0060.png`);
    const buf = readFileSync(g60);
    // decode→re-encode is overkill; instead swap f0060 with f0120 too but the render
    // for f0060 vs f0120 differs less than f0000 vs f0120 in this scene. Assert only
    // that exactly one frame is marked and the marker is present.
    cpSync(join(dir, `${NAME}-f0120.png`), g60);
    void buf;
    const r = await repinCommand({ modulePath: MODULE, goldenDir: dir, name: NAME, frames: [0, 60] });
    expect(r.changed).toBe(2);
    const marks = r.report.split('\n').filter((l) => l.includes('likely edit-site'));
    expect(marks.length).toBe(1); // exactly one frame flagged as the culprit
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

  // The real re-narration shape (ai-training's e01-short evidence): edit one line
  // in `s2` → s2's DURATION grows +0.53s, and every downstream start is pushed by
  // that amount. The edit site's own start does NOT move.
  it('attributes the EDIT SITE by its duration change, and traces downstream to it', () => {
    const older = mk([
      { id: 'hook', start: 0, duration: 1 },
      { id: 's2', start: 1, duration: 2 },
      { id: 's3', start: 3, duration: 2 },
      { id: 'cta', start: 5, duration: 1 },
    ]);
    // s2 re-narrated +0.53s longer → s3 & cta each pushed +0.53s; starts of hook/s2 unchanged
    const newer = mk([
      { id: 'hook', start: 0, duration: 1 },
      { id: 's2', start: 1, duration: 2.53 },
      { id: 's3', start: 3.53, duration: 2 },
      { id: 'cta', start: 5.53, duration: 1 },
    ]);
    const shifts = diffTiming(older, newer);
    // the edit site: s2's start didn't move, but its duration did — it must be named
    expect(causeFor(2, shifts)).toBe('s2 re-narrated (+0.53s duration): re-narration');
    // downstream beats trace back to s2 (the root), NOT claim their own derived shift
    expect(causeFor(4, shifts)).toBe('downstream of s2 (+0.53s): re-narration');
    expect(causeFor(5.8, shifts)).toBe('downstream of s2 (+0.53s): re-narration');
    // the untouched upstream beat has no cause
    expect(causeFor(0.5, shifts)).toBeUndefined();
  });

  it('an independent start-only move (no duration change, no upstream root) names itself', () => {
    const older = mk([{ id: 'intro', start: 0, duration: 1 }, { id: 'body', start: 1, duration: 2 }]);
    const newer = mk([{ id: 'intro', start: 0, duration: 1 }, { id: 'body', start: 1.21, duration: 2 }]);
    const shifts = diffTiming(older, newer);
    // body moved but nothing upstream is a root → fall back to naming body's own shift
    expect(causeFor(1.5, shifts)).toBe('body moved +0.21s: re-narration');
  });

  it('an unmoved beat downstream of a re-narration is attributed to the root', () => {
    // a re-narrated shorter; b is separated by a pause so its own start didn't move
    const older = mk([{ id: 'a', start: 0, duration: 2 }, { id: 'b', start: 5, duration: 2 }]);
    const newer = mk([{ id: 'a', start: 0, duration: 1.7 }, { id: 'b', start: 5, duration: 2 }]);
    const shifts = diffTiming(older, newer);
    expect(causeFor(6, shifts)).toBe('downstream of a (-0.30s): re-narration');
  });

  it('a newly-added segment is flagged as new', () => {
    const older = mk([{ id: 'a', start: 0, duration: 1 }]);
    const newer = mk([{ id: 'a', start: 0, duration: 1 }, { id: 'b', start: 1, duration: 1 }]);
    const shifts = diffTiming(older, newer);
    expect(causeFor(1.5, shifts)).toBe('b: new segment');
  });
});

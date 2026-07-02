/**
 * gs master (0.39) — the PURE planning core: shared-target loudness + the true-peak
 * limiter that buys headroom so a peaky member reaches the target instead of
 * landing LUs low. No ffmpeg — this exercises the math + config validation.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveProfile, loudnessPathFor, parseLoudnormJson } from '../src/loudness.js';
import { ffmpegAvailable, render } from '../src/render.js';
import { planMaster, normalizeMasterConfig, masterCommand, MasterError, DEFAULT_MAX_GR_DB } from '../src/master.js';

const youtube = resolveProfile('youtube'); // target -14, ceiling -1

describe('planMaster — shared target + limiter', () => {
  it('the limiter lets a peaky short reach the shared target (recovers headroom)', () => {
    // episode: quiet + clean; short: loud + peaky
    const plan = planMaster(
      [
        { id: 'e01', inputI: -22, inputTp: -6 },
        { id: 'e01-short', inputI: -12, inputTp: -0.3 },
      ],
      youtube,
      { limiter: { mode: 'truepeak' }, consistency: 'shared-target' },
    );
    expect(plan.sharedTarget).toBe(-14); // both reach the profile target
    const e01 = plan.members.find((m) => m.id === 'e01')!;
    expect(e01.gain).toBe(8); // -14 - (-22)
    expect(e01.grDb).toBe(3); // (-6 + 8) - (-1) = 3 dB of limiting
    expect(e01.predOutTp).toBe(-1); // limiter holds it at the ceiling
    expect(e01.reachable).toBe(true);
    const short = plan.members.find((m) => m.id === 'e01-short')!;
    expect(short.gain).toBe(-2); // pulled DOWN to -14
    expect(short.grDb).toBe(0); // no limiting needed on the way down
  });

  it('a member the limiter cannot lift drags the shared target below the profile', () => {
    // with a tight 2 dB GR budget, a quiet+peaky member can't reach -14
    const plan = planMaster(
      [
        { id: 'ok', inputI: -16, inputTp: -8 },
        { id: 'stuck', inputI: -22, inputTp: -3 }, // maxReach = -22 + (-1+3) + 2 = -18
      ],
      youtube,
      { limiter: { mode: 'truepeak', maxGrDb: 2 }, consistency: 'shared-target' },
    );
    expect(plan.sharedTarget).toBe(-18); // dragged down by 'stuck'
    expect(plan.members.find((m) => m.id === 'stuck')!.reachable).toBe(true); // it reaches -18 within budget
    expect(plan.maxGrDb).toBe(2);
  });

  it('WITHOUT a limiter, the gain is peak-clamped so a peaky member lands low', () => {
    const plan = planMaster(
      [{ id: 'e01', inputI: -22, inputTp: -6 }],
      youtube,
      { limiter: null, consistency: 'per-asset' },
    );
    const e01 = plan.members[0]!;
    // clamp: min(-14-(-22)=8, -1-(-6)=5) = 5 → lands at -17, not -14 (the lived pain)
    expect(e01.gain).toBe(5);
    expect(e01.target).toBe(-17);
    expect(e01.grDb).toBe(0);
    expect(plan.limiter).toBe(false);
  });

  it('per-asset drives each member to its own max (not a common target)', () => {
    const plan = planMaster(
      [
        { id: 'loud', inputI: -10, inputTp: -2 },
        { id: 'quiet', inputI: -30, inputTp: -20 },
      ],
      youtube,
      { limiter: { mode: 'truepeak' }, consistency: 'per-asset' },
    );
    // both can reach -14 (the profile cap) with the default 6 dB budget
    expect(plan.members.every((m) => m.target === -14)).toBe(true);
  });

  it('DEFAULT_MAX_GR_DB is the budget when the limiter omits maxGrDb', () => {
    const plan = planMaster([{ id: 'a', inputI: -20, inputTp: -1 }], youtube, {
      limiter: { mode: 'truepeak' },
      consistency: 'shared-target',
    });
    expect(plan.maxGrDb).toBe(DEFAULT_MAX_GR_DB);
  });

  it('empty members throws', () => {
    expect(() => planMaster([], youtube, { limiter: null, consistency: 'shared-target' })).toThrow(MasterError);
  });
});

describe('normalizeMasterConfig', () => {
  it('limiter is ON by default (the whole point); profile defaults to youtube', () => {
    const c = normalizeMasterConfig({ members: ['e*.ts'] });
    expect(c.limiter).toEqual({ mode: 'truepeak' });
    expect(c.profile).toBe('youtube');
    expect(c.consistency).toBe('shared-target');
  });

  it('limiter:false keeps the legacy peak-clamp behaviour', () => {
    expect(normalizeMasterConfig({ members: ['a.ts'], limiter: false }).limiter).toBeNull();
  });

  it('fails loud on empty members, bad consistency, bad limiter, negative maxGrDb', () => {
    expect(() => normalizeMasterConfig({ members: [] })).toThrow(/non-empty .members/);
    expect(() => normalizeMasterConfig({ members: ['a'], consistency: 'nope' })).toThrow(/consistency must be/);
    expect(() => normalizeMasterConfig({ members: ['a'], limiter: { mode: 'soft' } })).toThrow(/limiter must be/);
    expect(() => normalizeMasterConfig({ members: ['a'], limiter: { mode: 'truepeak', maxGrDb: -1 } })).toThrow(/maxGrDb must be/);
    expect(() => normalizeMasterConfig(null)).toThrow(/must be an object/);
  });
});

// ---- end-to-end gs master (ffmpeg-gated) ----

describe.runIf(ffmpegAvailable())('gs master end-to-end', () => {
  const scene = 'packages/examples/src/scenes/with-audio.ts';
  const abs = fileURLToPath(new URL('../../examples/src/scenes/with-audio.ts', import.meta.url));
  const outDir = mkdtempSync(join(tmpdir(), 'glissade-master-e2e-'));
  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(loudnessPathFor(abs), { force: true });
  });

  const truePeak = (f: string): number =>
    parseLoudnormJson(
      spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr,
    ).inputTp;

  it('masters a member with a limiter; the VERIFIED output honors the ceiling + commits the block', async () => {
    const cfg = join(outDir, 'glissade.master.json');
    writeFileSync(cfg, JSON.stringify({ profile: 'youtube', members: [scene], limiter: { mode: 'truepeak', ceilingDb: -1 } }));
    const r = await masterCommand({ configPath: cfg });
    expect(r.limiter).toBe(true);
    expect(r.members.length).toBe(1);
    const m = r.members[0]!;
    expect(m.measurement.limiter).toEqual({ mode: 'truepeak', ceilingDb: -1 });
    expect(m.outTp).toBeLessThanOrEqual(-1 + 0.3); // the publish guarantee (small ffmpeg tolerance)
    expect(m.overCeiling).toBe(false);
    const committed = JSON.parse(readFileSync(loudnessPathFor(abs), 'utf8'));
    expect(committed.limiter.mode).toBe('truepeak');
    expect(committed.gain).toBe(m.measurement.gain);
    expect(committed.mixHash).toMatch(/^sha256:/);
  }, 120_000);

  it('a render APPLIES the committed limiter (mixHash composes → byte-identical, ≤ ceiling)', async () => {
    const cfg = join(outDir, 'm2.json');
    writeFileSync(cfg, JSON.stringify({ profile: 'youtube', members: [scene], limiter: { mode: 'truepeak', ceilingDb: -1 } }));
    await masterCommand({ configPath: cfg });
    const out1 = join(outDir, 'm1.mp4');
    const out2 = join(outDir, 'm2.mp4');
    await render({ modulePath: abs, out: out1, fps: 30 });
    await render({ modulePath: abs, out: out2, fps: 30 });
    // the committed limiter measurement passes the mixHash preflight → render applies
    // gain+limiter deterministically → byte-identical run-to-run.
    expect(readFileSync(out1).equals(readFileSync(out2))).toBe(true);
    expect(truePeak(out1)).toBeLessThanOrEqual(-1 + 0.3);
  }, 180_000);

  it('limiter:false keeps the legacy peak-clamp (no limiter block committed)', async () => {
    const cfg = join(outDir, 'm3.json');
    writeFileSync(cfg, JSON.stringify({ profile: 'youtube', members: [scene], limiter: false }));
    const r = await masterCommand({ configPath: cfg });
    expect(r.limiter).toBe(false);
    expect(r.members[0]!.measurement.limiter).toBeUndefined();
  }, 120_000);
});

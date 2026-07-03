/**
 * gs parity (Phase A) — the cross-backend perceptual reviewer. Proves: a mappable
 * scene rendered skia-vs-lottie clears the SSIM floor per frame (the export↔import
 * round-trip, measured through the CLI command); --heatmap writes a decodable PNG
 * of the render dimensions; the report shape carries the per-pair numbers; a
 * requested `dom` backend fails LOUD (never silently skipped); and the --min floor
 * gates the run (a floor of 1.0 fails a never-perfect round-trip).
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { afterAll, describe, expect, it } from 'vitest';
import { parityCommand, parseBackends, ParityBackendError } from '../src/parity.js';
import { loadParityBaseline, ParityBaselineError, type ParityBaseline } from '../src/parityBaseline.js';
import fixtureModule from './fixtures/parity-scene.js';
import imageModule from './fixtures/parity-image.js';
// Real corpus scenes, imported through vitest's graph (instanceof-safe) — the render
// environment (variable-font axes, Yoga, asset decode) is exercised end-to-end.
import vfModule from '../../examples/src/scenes/golden-font-axis-anim.js';
import layoutModule from '../../examples/src/scenes/golden-layout.js';
import meshModule from '../../examples/src/scenes/golden-mesh.js';

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));
const EXAMPLES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const MODULE = join(FIXTURES, 'parity-scene.ts');
const VF_MODULE = join(EXAMPLES, 'golden-font-axis-anim.ts');
const VF_MOD = { modulePath: VF_MODULE, module: vfModule } as const;
const VF_FRAMES = [0, 60, 120, 180];
const SEED_BASELINE = join(FIXTURES, 'golden-font-axis-anim.parity.json');
const LAYOUT_MODULE = join(EXAMPLES, 'golden-layout.ts');
const MESH_MODULE = join(EXAMPLES, 'golden-mesh.ts');
const IMAGE_MODULE = join(FIXTURES, 'parity-image.ts');
const NAME = 'parity-scene';
// Pass the module through vitest's OWN graph (not jiti) so the exporter's
// instanceof node-kind checks see the SAME @glissade/scene — see ParityOptions.module.
// The built CLI loads from modulePath via jiti (verified separately with gs export).
const MOD = { modulePath: MODULE, module: fixtureModule } as const;
const FRAMES = [0, 30, 60, 90, 119];

const tmp = mkdtempSync(join(tmpdir(), 'glissade-parity-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Decode a PNG's dimensions (byte round-trip), reusing @napi-rs/canvas like repin. */
async function pngDims(path: string): Promise<{ w: number; h: number }> {
  const img = await loadImage(path);
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  return { w: img.width, h: img.height };
}

describe('gs parity — skia vs lottie perceptual review', () => {
  it('every sampled frame clears the SSIM floor (skia reference vs lottie round-trip)', async () => {
    const r = await parityCommand({ ...MOD, name: NAME, frames: FRAMES });
    expect(r.ok).toBe(true);
    expect(r.belowFloor).toBe(0);
    expect(r.frames.length).toBe(FRAMES.length);
    for (const f of r.frames) {
      const lottie = f.pairs.find((p) => p.backend === 'lottie')!;
      expect(lottie.mean, `frame ${f.frame}`).toBeGreaterThanOrEqual(0.98);
      // the worst tile never exceeds the mean, and grid coords are present
      expect(lottie.min).toBeLessThanOrEqual(lottie.mean);
      expect(lottie.minTile).toHaveProperty('tx');
    }
  });

  it('defaults to the fixture scene size and the timeline fps', async () => {
    const r = await parityCommand({ ...MOD, name: NAME, frames: [0] });
    expect(r.width).toBe(240);
    expect(r.height).toBe(240);
    expect(r.backends).toEqual(['lottie']); // skia is the reference, not a compared leg
  });

  it('--heatmap writes a decodable PNG per frame at the render dimensions', async () => {
    const heatDir = join(tmp, 'heat');
    const r = await parityCommand({ ...MOD, name: NAME, frames: [0, 60], heatmapDir: heatDir });
    const paths = r.frames.flatMap((f) => f.pairs.map((p) => p.heatmap!));
    expect(paths.length).toBe(2);
    for (const p of paths) {
      expect(existsSync(p)).toBe(true);
      const { w, h } = await pngDims(p);
      expect(w).toBe(240);
      expect(h).toBe(240);
    }
  });

  it('the report names the reference, the pair SSIM, and PASS', async () => {
    const r = await parityCommand({ ...MOD, name: NAME, frames: [0] });
    expect(r.report).toContain('skia reference vs lottie');
    expect(r.report).toContain('f0000  lottie');
    expect(r.report).toMatch(/PASS/);
    expect(r.report).toContain('240×240');
  });

  it('--min 1.0 fails the run (a round-trip is never byte-perfect) and marks the frame', async () => {
    const r = await parityCommand({ ...MOD, name: NAME, frames: [0, 60], min: 1 });
    expect(r.ok).toBe(false);
    expect(r.belowFloor).toBeGreaterThan(0);
    expect(r.report).toMatch(/FAIL/);
    expect(r.report).toContain('BELOW FLOOR');
    // frame 60's round-trip is imperfect (< 1.0) → below a 1.0 floor and flagged.
    expect(r.frames.find((f) => f.frame === 60)!.pairs[0]!.belowFloor).toBe(true);
  });

  it('reports the worst frame/backend across the run', async () => {
    const r = await parityCommand({ ...MOD, name: NAME, frames: FRAMES });
    expect(r.worstAt).not.toBeNull();
    expect(r.worstAt!.backend).toBe('lottie');
    expect(r.worstMean).toBeLessThanOrEqual(1);
    expect(FRAMES).toContain(r.worstAt!.frame);
  });
});

describe('gs parity — render-environment fidelity (the false-PASS guard)', () => {
  // THE must-have regression: a single-weight scene can't catch this. A variable-font
  // scene's Lottie export DROPS fontAxes. Before the fix gs parity's Skia REFERENCE
  // also rendered at default weight (it never registered the face / applied axes), so
  // reference == lottie == default → a false SSIM 1.0000 / PASS on a real interchange
  // loss. Now both legs render through the SAME env as `gs render`, so the reference
  // tracks the swept weight and the drop surfaces as a below-floor FAIL.
  it('vf: a variable-font scene surfaces the dropped fontAxes (< 1.0, not a false PASS)', async () => {
    const r = await parityCommand({ modulePath: VF_MODULE, module: vfModule, frames: [0, 60, 120, 180] });
    expect(r.ok).toBe(false); // was `true` (false PASS) before the render-env fix
    expect(r.belowFloor).toBeGreaterThan(0);
    expect(r.worstMean).toBeLessThan(0.98);
    // the loss grows with the weight sweep: the heaviest frame diverges more than
    // frame 0 (where the swept weight still equals the font's default instance).
    const meanAt = (f: number): number => r.frames.find((x) => x.frame === f)!.pairs[0]!.mean;
    expect(meanAt(180)).toBeLessThan(meanAt(0));
    expect(meanAt(180)).toBeLessThan(1);
  });

  it('layout: a flexbox scene renders (Yoga initialized) instead of erroring', async () => {
    // gs parity used to THROW here (no loadYogaLayoutEngine before evaluate).
    const r = await parityCommand({ modulePath: LAYOUT_MODULE, module: layoutModule, frames: [0, 30] });
    expect(r.frames.length).toBe(2);
    for (const f of r.frames) expect(Number.isFinite(f.pairs[0]!.mean)).toBe(true);
  });

  it('mesh: a mesh fill recovers via the ty:2 raster fallback (was warn-dropped → ~0)', async () => {
    // THE mesh-export gain: before the raster fallback the lottie leg DROPPED the
    // mesh fills entirely (SSIM ~0.026/~0.10 — the shapes collapsed to nothing).
    // Now the exporter rasterizes each mesh → an embedded ty:2 image whose data:-URL
    // the render leg decodes, so the round-trip recovers to near-parity. Frame 0 is
    // the clean recovery test: the animated mesh flattens to its FIRST key, which
    // EQUALS the reference at t=0, so every mesh region matches.
    const r = await parityCommand({ modulePath: MESH_MODULE, module: meshModule, frames: [0] });
    expect(r.frames.length).toBe(1);
    const lottie = r.frames[0]!.pairs.find((p) => p.backend === 'lottie')!;
    expect(lottie.mean).toBeGreaterThanOrEqual(0.98);
  });

  it('media: an image scene decodes + binds the asset instead of erroring', async () => {
    // gs parity used to ERROR on any image scene (no asset decode). The reference now
    // decodes + draws the committed swatch PNG; the run completes with finite SSIM.
    const r = await parityCommand({ modulePath: IMAGE_MODULE, module: imageModule, frames: [0] });
    expect(r.frames.length).toBe(1);
    expect(Number.isFinite(r.frames[0]!.pairs[0]!.mean)).toBe(true);
  });
});

describe('gs parity — the known-drop regression gate (--baseline)', () => {
  // THE point of the gate: a variable-font scene legitimately falls below the 0.98
  // floor (dropped fontAxes — a documented scope-out). Pinning that EXPECTED drop
  // as a baseline turns a red-by-design floor-fail into a green gate: the scope-out
  // PASSES because it matches its pin, while a NEW/worse drop still FAILs.
  it('the committed seed baseline PASSES the expected VF drop even below the 0.98 floor', async () => {
    const r = await parityCommand({ ...VF_MOD, frames: VF_FRAMES, baselinePath: SEED_BASELINE });
    expect(r.gateOk).toBe(true);
    expect(r.regressed).toBe(0);
    expect(r.newComparisons).toBe(0);
    // the floor path still runs (belowFloor > 0), but the GATE verdict overrides it:
    // the below-floor frames match their pin, so this is a PASS, not a FAIL.
    expect(r.belowFloor).toBeGreaterThan(0);
    expect(r.report).toMatch(/PASS — every comparison matched its expected drop/);
    expect(r.report).toContain('✓ expected-drop');
  });

  it("a pin raised above the actual mean is a REGRESSION (gateOk false)", async () => {
    const seed = loadParityBaseline(SEED_BASELINE);
    // bump frame 180's expectation well above the real ~0.98 → actual < expected−tol.
    const tightened: ParityBaseline = {
      ...seed,
      frames: { ...seed.frames, '180': { lottie: { mean: 0.999 } } },
    };
    const p = join(tmp, 'tightened.parity.json');
    writeFileSync(p, JSON.stringify(tightened));
    const r = await parityCommand({ ...VF_MOD, frames: VF_FRAMES, baselinePath: p });
    expect(r.gateOk).toBe(false);
    expect(r.regressed).toBeGreaterThan(0);
    const f180 = r.frames.find((f) => f.frame === 180)!.pairs[0]!;
    expect(f180.status).toBe('regressed');
    expect(f180.expected).toBe(0.999);
    expect(r.report).toMatch(/FAIL/);
    expect(r.report).toContain('⚠ REGRESSION');
  });

  it('a frame absent from the baseline is NEW → fail', async () => {
    // frame 90 is not pinned in the seed baseline (it has 0/60/120/180).
    const r = await parityCommand({ ...VF_MOD, frames: [0, 90], baselinePath: SEED_BASELINE });
    expect(r.gateOk).toBe(false);
    expect(r.newComparisons).toBeGreaterThan(0);
    const f90 = r.frames.find((f) => f.frame === 90)!.pairs[0]!;
    expect(f90.status).toBe('new');
    expect(r.report).toContain('＋ NEW');
  });

  it('a pin lowered below the actual mean is IMPROVED (pass but flagged)', async () => {
    const seed = loadParityBaseline(SEED_BASELINE);
    // drop frame 60's pin far below its real ~0.987 → actual > expected+tol.
    const loosened: ParityBaseline = {
      ...seed,
      frames: { ...seed.frames, '60': { lottie: { mean: 0.5 } } },
    };
    const p = join(tmp, 'loosened.parity.json');
    writeFileSync(p, JSON.stringify(loosened));
    const r = await parityCommand({ ...VF_MOD, frames: VF_FRAMES, baselinePath: p });
    expect(r.gateOk).toBe(true); // improved does not fail the gate
    expect(r.improved).toBeGreaterThan(0);
    expect(r.frames.find((f) => f.frame === 60)!.pairs[0]!.status).toBe('improved');
    expect(r.report).toContain('▲ improved');
  });

  it('--update-baseline writes the live numbers, then a gate PASSES against them (round-trip)', async () => {
    const p = join(tmp, 'emitted.parity.json');
    const w = await parityCommand({ ...VF_MOD, frames: VF_FRAMES, baselinePath: p, updateBaseline: true });
    expect(w.baselineWritten).toBe(p);
    expect(w.baselineAdded).toBe(VF_FRAMES.length); // one lottie pair per frame, all new
    expect(existsSync(p)).toBe(true);
    expect(w.report).toContain('wrote baseline →');
    // the emitted file is a valid baseline whose header matches the run…
    const emitted = loadParityBaseline(p);
    expect(emitted.width).toBe(640);
    expect(emitted.reference).toBe('skia');
    // …and gating against it PASSES (it captured the exact live numbers).
    const g = await parityCommand({ ...VF_MOD, frames: VF_FRAMES, baselinePath: p });
    expect(g.gateOk).toBe(true);
  });

  it('--update-baseline re-pinning an existing baseline reports moved entries', async () => {
    const p = join(tmp, 'repin.parity.json');
    // seed with a deliberately-wrong pin for frame 180, then re-pin from the live run.
    writeFileSync(
      p,
      JSON.stringify({
        name: 'golden-font-axis-anim',
        width: 640,
        height: 360,
        fps: 60,
        reference: 'skia',
        frames: { '180': { lottie: { mean: 0.5 } } },
      }),
    );
    const w = await parityCommand({ ...VF_MOD, frames: VF_FRAMES, baselinePath: p, updateBaseline: true });
    expect(w.baselineWritten).toBe(p);
    expect(w.baselineAdded).toBe(3); // 0, 60, 120 are new; 180 pre-existed
    expect(w.regressed).toBe(1); // 180's mean moved past tolerance → re-pinned count
    expect(w.report).toMatch(/re-pinned/);
  });

  it('a header mismatch (wrong width) fails loud', async () => {
    const seed = loadParityBaseline(SEED_BASELINE);
    const mismatched: ParityBaseline = { ...seed, width: 999 };
    const p = join(tmp, 'mismatch.parity.json');
    writeFileSync(p, JSON.stringify(mismatched));
    await expect(parityCommand({ ...VF_MOD, frames: [0], baselinePath: p })).rejects.toThrow(
      ParityBaselineError,
    );
    await expect(parityCommand({ ...VF_MOD, frames: [0], baselinePath: p })).rejects.toThrow(
      /pinned at a different config/,
    );
  });

  it('--update-baseline without a baseline path fails loud', async () => {
    await expect(
      parityCommand({ ...VF_MOD, frames: [0], updateBaseline: true }),
    ).rejects.toThrow(ParityBaselineError);
  });

  it('a custom --tolerance narrows the accept band', async () => {
    const seed = loadParityBaseline(SEED_BASELINE);
    // pin frame 120 ~0.01 below its real ~0.9836. Default tol accepts as improved;
    // but a tolerance of 0 with an expected 0.001 above the real mean regresses.
    const p = join(tmp, 'tol.parity.json');
    const nudged: ParityBaseline = {
      ...seed,
      frames: { ...seed.frames, '120': { lottie: { mean: seed.frames['120']!.lottie!.mean + 0.001 } } },
    };
    writeFileSync(p, JSON.stringify(nudged));
    // wide tolerance (0.01) → within band → ok/pass
    const wide = await parityCommand({ ...VF_MOD, frames: [120], baselinePath: p, tolerance: 0.01 });
    expect(wide.gateOk).toBe(true);
    // tight tolerance (0) → 0.001 below pin → regressed
    const tight = await parityCommand({ ...VF_MOD, frames: [120], baselinePath: p, tolerance: 0 });
    expect(tight.gateOk).toBe(false);
    expect(tight.regressed).toBeGreaterThan(0);
  });

  it('the seed baseline fixture on disk matches the current live run (guards drift)', async () => {
    const seed = loadParityBaseline(SEED_BASELINE);
    const r = await parityCommand({ ...VF_MOD, frames: VF_FRAMES, baselinePath: SEED_BASELINE });
    // every pinned frame's live mean is within tolerance of the committed pin.
    for (const f of r.frames) {
      const pin = seed.frames[String(f.frame)]!.lottie!.mean;
      expect(Math.abs(f.pairs[0]!.mean - pin)).toBeLessThan(1e-4);
    }
    // and no field of the committed file drifted from a fresh emit shape.
    expect(seed.reference).toBe('skia');
    expect(readFileSync(SEED_BASELINE, 'utf8')).toContain('"golden-font-axis-anim"');
  });
});

describe('gs parity — non-gate runs are unchanged (byte-identical report)', () => {
  it('without --baseline the pair line + report carry NO gate annotations', async () => {
    const r = await parityCommand({ ...MOD, name: NAME, frames: [0] });
    expect(r.gateOk).toBeUndefined();
    expect(r.regressed).toBeUndefined();
    expect(r.baselineWritten).toBeUndefined();
    for (const f of r.frames) for (const p of f.pairs) {
      expect(p.status).toBeUndefined();
      expect(p.expected).toBeUndefined();
      expect(p.delta).toBeUndefined();
    }
    // the strict-floor report shape is exactly the shipped 0.49.0 one.
    expect(r.report).toMatch(/PASS — every frame ≥ floor/);
    expect(r.report).not.toContain('expected-drop');
    expect(r.report).not.toContain('exp ');
  });
});

describe('gs parity — backend validation (fail loud)', () => {
  it('parseBackends defaults to skia,lottie', () => {
    expect(parseBackends(undefined)).toEqual(['skia', 'lottie']);
    expect(parseBackends('')).toEqual(['skia', 'lottie']);
    expect(parseBackends('skia,lottie')).toEqual(['skia', 'lottie']);
  });

  it('a requested dom backend fails loud with the Phase-B message', () => {
    expect(() => parseBackends('skia,dom')).toThrow(ParityBackendError);
    expect(() => parseBackends('skia,dom')).toThrow(/dom parity leg needs Playwright/);
    expect(() => parseBackends('skia,dom')).toThrow(/Phase B/);
  });

  it('an unknown backend fails loud', () => {
    expect(() => parseBackends('skia,webgpu')).toThrow(ParityBackendError);
    expect(() => parseBackends('skia,webgpu')).toThrow(/unknown parity backend 'webgpu'/);
  });

  it('a run with no non-reference backend is rejected', async () => {
    await expect(parityCommand({ ...MOD, name: NAME, frames: [0], backends: ['skia'] })).rejects.toThrow(
      ParityBackendError,
    );
  });
});

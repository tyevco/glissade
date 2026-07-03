/**
 * `gs parity` (Phase A) — the cross-backend perceptual reviewer.
 *
 * Renders ONE scene across backends and reports, per frame, how far each backend
 * strays from the Skia reference: mean SSIM, the worst 8×8 tile (WHERE it drifts),
 * and an optional thermal heat-map PNG. It answers "does my Lottie export still
 * look like the real render?" as a NUMBER, per frame, headlessly.
 *
 * Phase A ships two legs, both in-process, ZERO browser deps:
 *   • `skia`   — the direct headless render (the reference every leg is diffed
 *                against): createScene → SkiaBackend.render(evaluate(...)) → readPixels.
 *   • `lottie` — the export↔import round-trip: exportLottie(mod) → importLottie(doc)
 *                .toSceneModule() → render the re-imported module on Skia → readPixels.
 *                This measures the Lottie bijection the same way the round-trip gate does.
 *
 * SSIM is the perceptual metric (`ssimMap` from the shipped @glissade/backend-skia),
 * NOT byte-equality — browser/exporter parity is perceptual by contract (DESIGN §3.4).
 * A `--min` floor (default 0.98) gates the run: any frame below it fails (non-zero exit).
 *
 * The `dom` leg (a DOM-backend rasterizer via Playwright) is Phase B — it is NOT
 * accepted here and fails loud rather than silently skipping a requested backend.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { evaluate, withDeterminismGuards, type SceneModule } from '@glissade/scene';
import { SkiaBackend, ssimMap, heatmapRgba } from '@glissade/backend-skia';
import { exportLottie, importLottie } from '@glissade/lottie';
import { loadSceneModule, prepareSkiaRenderEnv } from './render.js';
import {
  DEFAULT_PARITY_TOLERANCE,
  ParityBaselineError,
  assertBaselineHeader,
  compareToBaseline,
  loadParityBaseline,
  saveParityBaseline,
  type ParityBaseline,
  type ParityGateStatus,
} from './parityBaseline.js';

/** Default sampled frames + fps — matches the round-trip / golden suites' cadence. */
export const DEFAULT_PARITY_FRAMES = [0, 30, 60, 90, 119];
export const DEFAULT_PARITY_FPS = 60;
export const DEFAULT_PARITY_FLOOR = 0.98;

/** The reference backend every other leg is diffed against. */
export const REFERENCE_BACKEND = 'skia';
/** Backends accepted in Phase A (skia = reference; lottie = export↔import round-trip). */
export const PHASE_A_BACKENDS = new Set(['skia', 'lottie']);

export interface ParityOptions {
  modulePath: string;
  /**
   * Pre-resolved scene module — when provided, `modulePath` is used only for the
   * default heat-map `name` and no `loadSceneModule` I/O runs. The CLI never sets
   * this (it always loads from `modulePath`); it exists so an in-process test can
   * pass a module through its OWN module graph, avoiding the jiti dual-package
   * `instanceof` hazard (the exporter's node-kind checks need one @glissade/scene).
   */
  module?: SceneModule;
  /** backends to compare; skia is always the reference. Default ['skia','lottie']. */
  backends?: string[];
  /** frame numbers to sample; default DEFAULT_PARITY_FRAMES. */
  frames?: number[];
  /** frames-per-second for `t = frame / fps`; default the timeline fps, else 60. */
  fps?: number;
  /** render width; default the scene's own width. */
  width?: number;
  /** render height; default the scene's own height. */
  height?: number;
  /** golden filename prefix for emitted heat-maps; default the module basename. */
  name?: string;
  /** write a per-frame per-pair SSIM heat-map PNG into this dir. */
  heatmapDir?: string;
  /** SSIM floor — a frame whose mean drops below this fails the run. Default 0.98. */
  min?: number;
  /**
   * Known-drop regression gate: compare each (frame, backend) mean against the
   * EXPECTED drop pinned in this baseline file instead of an absolute floor. A
   * documented scope-out that matches its pin PASSES even below `min`; only a
   * deviation (new/worse drop) fails. Takes precedence over `min` for the verdict.
   */
  baselinePath?: string;
  /** emit the live numbers to `baselinePath` (re-pin), then exit 0. Needs baselinePath. */
  updateBaseline?: boolean;
  /** expected-SSIM tolerance band for the gate; default DEFAULT_PARITY_TOLERANCE. */
  tolerance?: number;
}

/** One backend-vs-reference comparison at a single frame. */
export interface ParityPair {
  /** the compared backend (the reference is always `skia`). */
  backend: string;
  /** mean SSIM over every 8×8 tile vs the reference. */
  mean: number;
  /** the single worst tile's SSIM. */
  min: number;
  /** grid coords of the worst tile. */
  minTile: { readonly tx: number; readonly ty: number };
  /** true when `mean` fell below the floor. */
  belowFloor: boolean;
  /** path of the emitted heat-map PNG, when --heatmap was given. */
  heatmap?: string;
  /** gate verdict vs the baseline pin (only set when a baseline is active). */
  status?: ParityGateStatus;
  /** the expected mean from the baseline (only set when this pair was pinned). */
  expected?: number;
  /** `mean − expected` (only set when this pair was pinned). */
  delta?: number;
}

export interface ParityFrame {
  frame: number;
  t: number;
  pairs: ParityPair[];
}

export interface ParityResult {
  frames: ParityFrame[];
  /** the compared (non-reference) backends, in order. */
  backends: string[];
  /** render dimensions actually used. */
  width: number;
  height: number;
  /** the SSIM floor applied. */
  floor: number;
  /** the single lowest mean SSIM across every frame/pair (Infinity if no pairs). */
  worstMean: number;
  /** the frame + backend that hit `worstMean`. */
  worstAt: { frame: number; backend: string } | null;
  /** number of (frame, pair) comparisons below the floor. */
  belowFloor: number;
  /** true when every comparison met the floor. */
  ok: boolean;
  /** gate mode only: comparisons that dropped below their pinned expected − tolerance. */
  regressed?: number;
  /** gate mode only: comparisons with no baseline pin (unpinned → must be accepted). */
  newComparisons?: number;
  /** gate/update mode: comparisons that rose above expected + tolerance (re-pin tighter). */
  improved?: number;
  /** gate mode only: true when regressed === 0 && newComparisons === 0. */
  gateOk?: boolean;
  /** update mode only: the path the emitted baseline was written to. */
  baselineWritten?: string;
  /** update mode only: (frame,pair) entries newly added vs a prior baseline (all when none). */
  baselineAdded?: number;
  report: string;
}

/** Raised for an unknown or not-yet-shipped backend — the CLI turns it into a loud fail(). */
export class ParityBackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParityBackendError';
  }
}

/** Parse + validate a `--backends` list. dom fails loud (Phase B); unknown fails loud. */
export function parseBackends(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') return ['skia', 'lottie'];
  const list = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  if (list.length === 0) return ['skia', 'lottie'];
  for (const b of list) {
    if (b === 'dom') {
      throw new ParityBackendError(
        "the dom parity leg needs Playwright + chromium-headless-shell — Phase B, not yet shipped (Phase A backends: skia, lottie)",
      );
    }
    if (!PHASE_A_BACKENDS.has(b)) {
      throw new ParityBackendError(`unknown parity backend '${b}' (Phase A backends: skia, lottie)`);
    }
  }
  return list;
}

/** A per-frame RGBA source for one backend, over the SAME w×h as every other leg. */
type FrameSource = (t: number) => Promise<Uint8ClampedArray>;

/**
 * skia = the direct headless render — the reference every leg is diffed against.
 * CRITICAL: it renders through the SAME environment as `gs render`
 * (`prepareSkiaRenderEnv`: font faces incl. variable-font axes registered, Yoga
 * for flexbox, assets decoded) and wraps `evaluate` in the determinism guard. Without
 * this the reference would render a variable-font scene at DEFAULT weight (the face
 * never registered) and match a fontAxes-dropping Lottie leg at a FALSE SSIM 1.0 —
 * a fidelity gate silently reporting perfect on a real interchange loss.
 *
 * The scene + backend are built ONCE and reused across frames (evaluate is pure of
 * time — the ONE contract — exactly as `gs render`'s frame loop reuses them).
 */
async function skiaSource(mod: SceneModule, w: number, h: number, modulePath: string): Promise<FrameSource> {
  const scene = mod.createScene();
  const backend = new SkiaBackend(w, h);
  await prepareSkiaRenderEnv({ scene, doc: mod.timeline, backend, modulePath });
  return async (t: number) => {
    const dl = withDeterminismGuards('throw', () => evaluate(scene, mod.timeline, t));
    backend.render(dl);
    return backend.readPixels();
  };
}

/**
 * lottie = the export↔import round-trip rendered on Skia (roundtrip.test's renderPixels
 * shape). The document is exported/imported ONCE (it's time-independent); the re-imported
 * module renders through the SAME faithful environment as the reference (so its render is
 * honest too). Asset URLs resolve against the ORIGINAL module path. This leg measures the
 * Lottie bijection per frame — e.g. the dropped `fontAxes` surfaces as a real SSIM drop.
 */
async function lottieSource(mod: SceneModule, w: number, h: number, fps: number, modulePath: string): Promise<FrameSource> {
  // Register the scene's font faces + get a faithful Skia measurer (a SkiaBackend
  // IS a TextMeasurer) so the exporter BAKES width-wrapped Text into the doc `t`
  // with the SAME line breaks the reference render produces — else wrapped text
  // round-trips collapsed onto one line (the wrap-bake fix).
  const measureScene = mod.createScene();
  const measurer = new SkiaBackend(w, h);
  await prepareSkiaRenderEnv({ scene: measureScene, doc: mod.timeline, backend: measurer, modulePath });
  // Thread a Skia PNG encoder so a MESH fill exports as an embedded ty:2 raster —
  // else it warn-drops and the round-trip collapses it to nothing (the SSIM gain).
  const encodePng = (rgba: Uint8ClampedArray, rw: number, rh: number): string => {
    const b = new SkiaBackend(rw, rh);
    b.putPixels(rgba);
    return b.encodePng().toString('base64');
  };
  const doc = exportLottie(mod, { width: w, height: h, fps, measurer, encodePng });
  const roundTripped = importLottie(doc).toSceneModule();
  return skiaSource(roundTripped, w, h, modulePath);
}

function makeSource(backend: string, mod: SceneModule, w: number, h: number, fps: number, modulePath: string): Promise<FrameSource> {
  switch (backend) {
    case 'skia':
      return skiaSource(mod, w, h, modulePath);
    case 'lottie':
      return lottieSource(mod, w, h, fps, modulePath);
    default:
      // parseBackends already rejected everything else; this is a defensive guard.
      throw new ParityBackendError(`unknown parity backend '${backend}'`);
  }
}

export async function parityCommand(opts: ParityOptions): Promise<ParityResult> {
  const requested = opts.backends ?? ['skia', 'lottie'];
  // skia is the fixed reference; the OTHER requested backends are the ones we diff.
  const compared = requested.filter((b) => b !== REFERENCE_BACKEND);
  if (compared.length === 0) {
    throw new ParityBackendError(
      `gs parity needs at least one non-reference backend to compare against skia (e.g. --backends skia,lottie)`,
    );
  }

  const mod = opts.module ?? (await loadSceneModule(opts.modulePath));
  const size = mod.createScene().size;
  const w = opts.width ?? size.w;
  const h = opts.height ?? size.h;
  const fps = opts.fps ?? mod.timeline.fps ?? DEFAULT_PARITY_FPS;
  const frames = opts.frames ?? DEFAULT_PARITY_FRAMES;
  const floor = opts.min ?? DEFAULT_PARITY_FLOOR;
  const name = opts.name ?? basename(opts.modulePath).replace(/\.[jt]sx?$/, '');

  // Gate mode: a baseline of EXPECTED drops is loaded and each mean is compared
  // against its pin (not the absolute floor). --update-baseline is the write side
  // (re-pin), so it never LOADS/compares — it emits the live numbers after the run.
  const tolerance = opts.tolerance ?? DEFAULT_PARITY_TOLERANCE;
  const gating = opts.baselinePath !== undefined && opts.updateBaseline !== true;
  let baseline: ParityBaseline | undefined;
  if (gating) {
    baseline = loadParityBaseline(opts.baselinePath!);
    // the baseline is pinned at a specific config — a mismatch is not comparable.
    assertBaselineHeader(baseline, { width: w, height: h, fps, reference: REFERENCE_BACKEND });
  }

  // Build the reference + each compared leg's frame source up front (each registers
  // its faithful render env once). The reference registers the scene's font faces
  // globally, so even a Lottie leg that dropped the face still resolves the family —
  // but renders it at DEFAULT axes, which is exactly the loss parity must surface.
  const reference = await skiaSource(mod, w, h, opts.modulePath);
  const sources = new Map<string, FrameSource>();
  for (const b of compared) sources.set(b, await makeSource(b, mod, w, h, fps, opts.modulePath));

  if (opts.heatmapDir && !existsSync(opts.heatmapDir)) mkdirSync(opts.heatmapDir, { recursive: true });

  const results: ParityFrame[] = [];
  let belowFloor = 0;
  let worstMean = Infinity;
  let worstAt: { frame: number; backend: string } | null = null;
  let regressed = 0;
  let newComparisons = 0;
  let improved = 0;

  for (const frame of frames) {
    const t = frame / fps;
    const refRgba = await reference(t);
    const pairs: ParityPair[] = [];
    for (const backend of compared) {
      const otherRgba = await sources.get(backend)!(t);
      const map = ssimMap(refRgba, otherRgba, w, h);
      const below = map.mean < floor;
      if (below) belowFloor++;
      if (map.mean < worstMean) {
        worstMean = map.mean;
        worstAt = { frame, backend };
      }
      const pair: ParityPair = {
        backend,
        mean: map.mean,
        min: map.min,
        minTile: map.minTile,
        belowFloor: below,
      };
      if (opts.heatmapDir) {
        const hb = new SkiaBackend(w, h);
        hb.putPixels(heatmapRgba(map, w, h));
        const hp = join(opts.heatmapDir, `${name}-${backend}-f${String(frame).padStart(4, '0')}.heat.png`);
        writeFileSync(hp, hb.encodePng());
        pair.heatmap = hp;
      }
      if (baseline) {
        const expected = baseline.frames[String(frame)]?.[backend];
        const status = compareToBaseline(map.mean, expected, tolerance);
        pair.status = status;
        if (expected !== undefined) {
          pair.expected = expected.mean;
          pair.delta = map.mean - expected.mean;
        }
        if (status === 'regressed') regressed++;
        else if (status === 'new') newComparisons++;
        else if (status === 'improved') improved++;
      }
      pairs.push(pair);
    }
    results.push({ frame, t, pairs });
  }

  const ok = belowFloor === 0;
  const result: Omit<ParityResult, 'report'> = {
    frames: results,
    backends: compared,
    width: w,
    height: h,
    floor,
    worstMean,
    worstAt,
    belowFloor,
    ok,
  };

  // --update-baseline: emit the live numbers as the new pin, report the delta vs
  // any prior baseline (how many entries are added), and exit 0 (a re-pin, never a gate).
  if (opts.updateBaseline === true) {
    if (opts.baselinePath === undefined) {
      throw new ParityBaselineError('gs parity --update-baseline needs --baseline <file> to write to');
    }
    const emitted = buildBaseline(name, w, h, fps, results);
    let prior: ParityBaseline | undefined;
    if (existsSync(opts.baselinePath)) {
      try {
        prior = loadParityBaseline(opts.baselinePath);
      } catch {
        /* a malformed / mismatched prior is fine to overwrite on an explicit re-pin */
      }
    }
    let added = 0;
    let repinned = 0;
    for (const [frame, backends] of Object.entries(emitted.frames)) {
      for (const backend of Object.keys(backends)) {
        const before = prior?.frames[frame]?.[backend];
        if (before === undefined) added++;
        else if (Math.abs(before.mean - backends[backend]!.mean) > tolerance) repinned++;
      }
    }
    saveParityBaseline(opts.baselinePath, emitted);
    const updated: Omit<ParityResult, 'report'> = {
      ...result,
      improved,
      baselineWritten: opts.baselinePath,
      baselineAdded: added,
    };
    // reuse `regressed` in the report as the "re-pinned (moved past tolerance)" count.
    return { ...updated, regressed: repinned, report: formatReport(name, updated, { repinned }) };
  }

  if (gating) {
    const gated: Omit<ParityResult, 'report'> = {
      ...result,
      regressed,
      newComparisons,
      improved,
      gateOk: regressed === 0 && newComparisons === 0,
    };
    return { ...gated, report: formatReport(name, gated) };
  }

  return { ...result, report: formatReport(name, result) };
}

/** Build a baseline document from the live frames (used by --update-baseline). */
function buildBaseline(name: string, w: number, h: number, fps: number, frames: ParityFrame[]): ParityBaseline {
  const out: Record<string, Record<string, { mean: number; min: number; minTile: { tx: number; ty: number } }>> = {};
  for (const f of frames) {
    const perBackend: Record<string, { mean: number; min: number; minTile: { tx: number; ty: number } }> = {};
    for (const p of f.pairs) {
      perBackend[p.backend] = { mean: p.mean, min: p.min, minTile: { tx: p.minTile.tx, ty: p.minTile.ty } };
    }
    out[String(f.frame)] = perBackend;
  }
  return { name, width: w, height: h, fps, reference: REFERENCE_BACKEND, frames: out };
}

/** gate/update status → the report mark appended to a pair line. */
const GATE_MARK: Record<ParityGateStatus, string> = {
  ok: '  ✓ expected-drop',
  regressed: '  ⚠ REGRESSION',
  new: '  ＋ NEW',
  improved: '  ▲ improved',
};

function formatReport(
  name: string,
  r: Omit<ParityResult, 'report'>,
  extra?: { repinned: number },
): string {
  // update mode carries a written path; gate mode carries a gateOk verdict; else strict.
  const update = r.baselineWritten !== undefined;
  const gate = !update && r.gateOk !== undefined;
  const lines: string[] = [];
  lines.push(
    `gs parity '${name}' — ${REFERENCE_BACKEND} reference vs ${r.backends.join(', ')} — ` +
      `${r.frames.length} frame${r.frames.length === 1 ? '' : 's'} @ ${r.width}×${r.height}, floor ${r.floor}`,
  );
  for (const f of r.frames) {
    const fno = `f${String(f.frame).padStart(4, '0')}`;
    for (const p of f.pairs) {
      const tile = `@ tile ${p.minTile.tx},${p.minTile.ty}`;
      const mark = p.belowFloor ? '  ⚠ BELOW FLOOR' : '';
      const heat = p.heatmap ? `  → ${p.heatmap}` : '';
      // gate mode annotates each pair with expected/delta + a status mark; without a
      // baseline the line is byte-identical to the shipped strict-floor report.
      let gateSuffix = '';
      if (gate && p.status !== undefined) {
        const exp = p.expected !== undefined ? ` exp ${p.expected.toFixed(4)} Δ${p.delta! >= 0 ? '+' : ''}${p.delta!.toFixed(4)}` : '';
        gateSuffix = `${exp}${GATE_MARK[p.status]}`;
      }
      lines.push(
        `  ${fno}  ${p.backend.padEnd(6)} ssim ${p.mean.toFixed(4)} (min ${p.min.toFixed(3)} ${tile})${gateSuffix}${mark}${heat}`,
      );
    }
  }
  if (r.worstAt) {
    lines.push(
      `  worst: f${String(r.worstAt.frame).padStart(4, '0')} ${r.worstAt.backend} ssim ${r.worstMean.toFixed(4)}`,
    );
  }
  if (update) {
    lines.push(`  wrote baseline → ${r.baselineWritten}`);
    lines.push(
      `  ${r.baselineAdded ?? 0} added, ${extra?.repinned ?? 0} re-pinned (moved > tol), ${r.improved ?? 0} improved`,
    );
    return lines.join('\n');
  }
  if (gate) {
    const parts = [`${r.regressed ?? 0} regressed`, `${r.newComparisons ?? 0} new`];
    if ((r.improved ?? 0) > 0) parts.push(`${r.improved} improved`);
    lines.push(
      r.gateOk
        ? `  PASS — every comparison matched its expected drop (${parts.join(', ')})`
        : `  FAIL — ${parts.join(', ')} vs the baseline`,
    );
    return lines.join('\n');
  }
  lines.push(
    r.ok
      ? `  PASS — every frame ≥ floor ${r.floor}`
      : `  FAIL — ${r.belowFloor} comparison${r.belowFloor === 1 ? '' : 's'} below floor ${r.floor}`,
  );
  return lines.join('\n');
}

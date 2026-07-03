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
import { evaluate, type SceneModule } from '@glissade/scene';
import { SkiaBackend, ssimMap, heatmapRgba } from '@glissade/backend-skia';
import { exportLottie, importLottie } from '@glissade/lottie';
import { loadSceneModule } from './render.js';

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

/** skia = the direct headless render (repin's render→pixels shape) — the reference. */
function skiaSource(mod: SceneModule, w: number, h: number): FrameSource {
  return async (t: number) => {
    const scene = mod.createScene();
    const backend = new SkiaBackend(w, h);
    scene.setTextMeasurer(backend);
    backend.render(evaluate(scene, mod.timeline, t));
    return backend.readPixels();
  };
}

/**
 * lottie = the export↔import round-trip rendered on Skia (roundtrip.test's renderPixels
 * shape). The document is exported/imported ONCE (it's time-independent); each frame
 * evaluates the re-imported module — so the leg measures the Lottie bijection per frame.
 */
function lottieSource(mod: SceneModule, w: number, h: number, fps: number): FrameSource {
  const doc = exportLottie(mod, { width: w, height: h, fps });
  const roundTripped = importLottie(doc).toSceneModule();
  return skiaSource(roundTripped, w, h);
}

function makeSource(backend: string, mod: SceneModule, w: number, h: number, fps: number): FrameSource {
  switch (backend) {
    case 'skia':
      return skiaSource(mod, w, h);
    case 'lottie':
      return lottieSource(mod, w, h, fps);
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

  const reference = skiaSource(mod, w, h);
  const sources = new Map<string, FrameSource>(compared.map((b) => [b, makeSource(b, mod, w, h, fps)]));

  if (opts.heatmapDir && !existsSync(opts.heatmapDir)) mkdirSync(opts.heatmapDir, { recursive: true });

  const results: ParityFrame[] = [];
  let belowFloor = 0;
  let worstMean = Infinity;
  let worstAt: { frame: number; backend: string } | null = null;

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
  return { ...result, report: formatReport(name, result) };
}

function formatReport(name: string, r: Omit<ParityResult, 'report'>): string {
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
      lines.push(
        `  ${fno}  ${p.backend.padEnd(6)} ssim ${p.mean.toFixed(4)} (min ${p.min.toFixed(3)} ${tile})${mark}${heat}`,
      );
    }
  }
  if (r.worstAt) {
    lines.push(
      `  worst: f${String(r.worstAt.frame).padStart(4, '0')} ${r.worstAt.backend} ssim ${r.worstMean.toFixed(4)}`,
    );
  }
  lines.push(
    r.ok
      ? `  PASS — every frame ≥ floor ${r.floor}`
      : `  FAIL — ${r.belowFloor} comparison${r.belowFloor === 1 ? '' : 's'} below floor ${r.floor}`,
  );
  return lines.join('\n');
}

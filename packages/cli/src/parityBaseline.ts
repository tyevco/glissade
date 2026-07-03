/**
 * `gs parity` known-drop regression-gate — the committed per-scene baseline.
 *
 * `gs parity` (Phase A) is RED-BY-DESIGN: documented scope-outs (non-center-anchor
 * transforms, gradient/mesh fills, variable-font axes, text-wrap, media) legitimately
 * fall below the 0.98 SSIM floor and fail the strict `--min` path. That makes the
 * command a fidelity READOUT, not a regression gate you can wire into CI.
 *
 * This module turns it into a real gate: a committed baseline pins each scope-out's
 * EXPECTED SSIM drop per (frame, backend); the run compares actual vs expected and
 * alerts only on DEVIATION — a new/worse drop is a REGRESSION (fail), while a
 * documented drop that matches its pin PASSES even though it's below the floor.
 *
 * Mirrors `gs repin`'s golden/baseline model (write vs compare split): a default
 * conventional path (`parityBaselinePathFor`, like `goldenPathFor`), a loud header
 * validation (the baseline is pinned at a specific w×h/fps/reference), and a
 * four-way classify (`compareToBaseline`, like repin's `RepinStatus`).
 *
 * Pure of the render pipeline — plain JSON I/O over `node:fs`. `parity.ts` owns the
 * render; this owns the baseline. (Dependency runs one way: parity.ts → here.)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The expected SSIM for one (frame, backend) comparison. `min`/`minTile` are
 * OPTIONAL — a hand-seeding author (pinning a scope-out from a canary's
 * PARITY_BASELINE.md) writes only `mean`; `--update-baseline` emits all three.
 */
export interface ParityBaselineExpectation {
  /** the expected mean SSIM the live run is compared against. */
  mean: number;
  /** the worst-tile SSIM at pin time (informational; not gated). */
  min?: number;
  /** the worst tile's grid coords at pin time (informational; not gated). */
  minTile?: { readonly tx: number; readonly ty: number };
}

/**
 * A committed per-scene baseline of EXPECTED drops. Single scene per file
 * (`parityCommand` is single-scene, like `gs repin`). The header (width/height/
 * fps/reference) is VALIDATED against the live run so a baseline pinned at a
 * different config fails loud instead of silently comparing apples to oranges.
 */
export interface ParityBaseline {
  name: string;
  width: number;
  height: number;
  fps: number;
  /** the reference backend the expectations were measured against (always skia). */
  reference: string;
  /** flat `frame → backend → expected`. Frame keys are the integer frame as a string. */
  frames: Record<string, Record<string, ParityBaselineExpectation>>;
}

/** The four-way verdict for one (frame, backend) comparison against its pin. */
export type ParityGateStatus = 'ok' | 'regressed' | 'new' | 'improved';

/** Raised for a malformed / mismatched baseline — the CLI turns it into a loud fail(). */
export class ParityBaselineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParityBaselineError';
  }
}

/**
 * Default expected-SSIM tolerance band. Determinism makes the numbers near-exact
 * (the canary confirmed stable ×3), so this is float-jitter insurance — a drop
 * has to move by MORE than this to count as a regression / improvement.
 */
export const DEFAULT_PARITY_TOLERANCE = 1e-4;

/** Conventional baseline path for a scene — mirrors `goldenPathFor` (repin.ts). */
export function parityBaselinePathFor(dir: string, name: string): string {
  return join(dir, `${name}.parity.json`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readExpectation(where: string, raw: unknown): ParityBaselineExpectation {
  if (!isRecord(raw)) throw new ParityBaselineError(`parity baseline: ${where} is not an object`);
  if (typeof raw.mean !== 'number' || !Number.isFinite(raw.mean)) {
    throw new ParityBaselineError(`parity baseline: ${where} is missing a numeric 'mean'`);
  }
  const exp: ParityBaselineExpectation = { mean: raw.mean };
  if (raw.min !== undefined) {
    if (typeof raw.min !== 'number' || !Number.isFinite(raw.min)) {
      throw new ParityBaselineError(`parity baseline: ${where}.min is not a number`);
    }
    exp.min = raw.min;
  }
  if (raw.minTile !== undefined) {
    const mt = raw.minTile;
    if (!isRecord(mt) || typeof mt.tx !== 'number' || typeof mt.ty !== 'number') {
      throw new ParityBaselineError(`parity baseline: ${where}.minTile is not {tx,ty}`);
    }
    exp.minTile = { tx: mt.tx, ty: mt.ty };
  }
  return exp;
}

/** Read + structurally validate a baseline file. Any malformation fails LOUD. */
export function loadParityBaseline(path: string): ParityBaseline {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ParityBaselineError(
      `could not read parity baseline '${path}': ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!isRecord(parsed)) throw new ParityBaselineError(`parity baseline '${path}' is not a JSON object`);
  const { name, width, height, fps, reference, frames } = parsed;
  if (typeof name !== 'string') throw new ParityBaselineError(`parity baseline '${path}': missing string 'name'`);
  if (typeof width !== 'number' || width <= 0) throw new ParityBaselineError(`parity baseline '${path}': missing positive 'width'`);
  if (typeof height !== 'number' || height <= 0) throw new ParityBaselineError(`parity baseline '${path}': missing positive 'height'`);
  if (typeof fps !== 'number' || fps <= 0) throw new ParityBaselineError(`parity baseline '${path}': missing positive 'fps'`);
  if (typeof reference !== 'string') throw new ParityBaselineError(`parity baseline '${path}': missing string 'reference'`);
  if (!isRecord(frames)) throw new ParityBaselineError(`parity baseline '${path}': missing 'frames' object`);
  const outFrames: Record<string, Record<string, ParityBaselineExpectation>> = {};
  for (const [frame, backends] of Object.entries(frames)) {
    if (!isRecord(backends)) throw new ParityBaselineError(`parity baseline '${path}': frame '${frame}' is not an object`);
    const perBackend: Record<string, ParityBaselineExpectation> = {};
    for (const [backend, exp] of Object.entries(backends)) {
      perBackend[backend] = readExpectation(`frame '${frame}' backend '${backend}'`, exp);
    }
    outFrames[frame] = perBackend;
  }
  return { name, width, height, fps, reference, frames: outFrames };
}

/** Write a baseline (pretty JSON), creating the parent dir — mirrors repin's --write emit. */
export function saveParityBaseline(path: string, baseline: ParityBaseline): void {
  const dir = dirname(path);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
}

/**
 * Assert the baseline was pinned at the SAME config as the live run. A mismatch
 * means the numbers aren't comparable (a 480×480 pin vs a 240×240 run) → LOUD fail
 * rather than a meaningless gate verdict.
 */
export function assertBaselineHeader(
  b: ParityBaseline,
  live: { width: number; height: number; fps: number; reference: string },
): void {
  const mm: string[] = [];
  if (b.width !== live.width) mm.push(`width ${b.width} ≠ ${live.width}`);
  if (b.height !== live.height) mm.push(`height ${b.height} ≠ ${live.height}`);
  if (b.fps !== live.fps) mm.push(`fps ${b.fps} ≠ ${live.fps}`);
  if (b.reference !== live.reference) mm.push(`reference '${b.reference}' ≠ '${live.reference}'`);
  if (mm.length > 0) {
    throw new ParityBaselineError(
      `parity baseline pinned at a different config: ${mm.join(', ')} — re-pin with --update-baseline`,
    );
  }
}

/**
 * Classify one live comparison against its pin.
 *   • no pin (unpinned frame/backend) → 'new'      → FAIL (must be accepted via --update-baseline)
 *   • mean ≥ expected − tol           → 'ok'       → PASS (even below the 0.98 floor — the point)
 *   • mean < expected − tol           → 'regressed'→ FAIL (a new/worse drop)
 *   • mean > expected + tol           → 'improved' → PASS but FLAG (re-pin tighter)
 */
export function compareToBaseline(
  actualMean: number,
  expected: ParityBaselineExpectation | undefined,
  tolerance: number,
): ParityGateStatus {
  if (expected === undefined) return 'new';
  if (actualMean < expected.mean - tolerance) return 'regressed';
  if (actualMean > expected.mean + tolerance) return 'improved';
  return 'ok';
}

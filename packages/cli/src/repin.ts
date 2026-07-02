/**
 * `gs repin` (0.37) — the narration-aware golden reviewer.
 *
 * The lived pain: one re-narration re-flows every beat, so all of a project's
 * goldens go stale at once and you re-pin them blind with `vitest -u`. `gs repin`
 * renders the CURRENT scene frame-by-frame against the committed golden PNGs and,
 * for every frame that changed, reports:
 *
 *   • a perceptual delta (mean SSIM + the worst 8×8 tile — WHERE it changed), and
 *   • a one-line CAUSE, by diffing the scene's `*.narration.timing.json` sibling
 *     against a git ref (default HEAD): "seg-4 moved +0.21s: re-narration".
 *
 * Then it re-pins only the frames you allow. Default is a DRY RUN (report only);
 * `--write` overwrites the changed goldens. A `--floor <ssim>` guard REFUSES to
 * write any frame whose perceptual drop is bigger than you'd expect from a
 * re-narration (an actual regression sneaking into a re-pin) unless `--force`.
 *
 * Byte-equality stays the golden contract (same as the harness): a frame is
 * "identical" only when the PNG bytes match; SSIM is used solely to EXPLAIN and
 * to GATE a divergence, never to accept one silently.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { evaluate } from '@glissade/scene';
import { SkiaBackend, ssimMap, heatmapRgba } from '@glissade/backend-skia';
import type { NarrationTiming } from '@glissade/narrate';
import { loadSceneModule } from './render.js';
import { timingPathFor } from './captions.js';

/** The default golden frame set + fps — matches the Skia golden harness. */
export const DEFAULT_FRAMES = [0, 30, 60, 90, 120, 150, 179];
export const DEFAULT_FPS = 60;

export interface RepinOptions {
  modulePath: string;
  /** directory holding the committed golden PNGs. */
  goldenDir: string;
  /** golden filename prefix (`<name>-f0030.png`); default = the module basename. */
  name?: string;
  /** frame numbers to review; default DEFAULT_FRAMES. */
  frames?: number[];
  /** frames-per-second for `t = frame / fps`; default 60. */
  fps?: number;
  /** git ref to diff the narration timing sibling against for the cause line; default 'HEAD'. */
  since?: string;
  /** actually overwrite changed/new goldens (default: dry-run report). */
  write?: boolean;
  /** when writing, restrict to these frames (per-frame confirm). */
  only?: number[];
  /** write per-frame SSIM heat-map PNGs here for visual review. */
  heatmapDir?: string;
  /** refuse to write a frame whose mean SSIM fell below this (unless force). */
  floor?: number;
  /** override the floor guard. */
  force?: boolean;
}

export type RepinStatus = 'identical' | 'changed' | 'new' | 'missing';

export interface RepinFrame {
  frame: number;
  t: number;
  status: RepinStatus;
  /** mean SSIM vs the golden (changed frames only). */
  ssim?: number;
  /** worst-tile SSIM (changed frames only). */
  minSsim?: number;
  /** the narration cause line, when a timing shift explains the change. */
  cause?: string;
  /** true when this frame's golden PNG was (re)written. */
  wrote: boolean;
  /** true when a write was refused because the drop fell below --floor. */
  blocked?: boolean;
  /** path of the heat-map PNG, when --heatmap was given. */
  heatmap?: string;
}

export interface RepinResult {
  frames: RepinFrame[];
  changed: number;
  wrote: number;
  blocked: number;
  /** true when the timing sibling was resolved AND diffed against `since`. */
  causeSource: string | null;
  report: string;
}

// ── narration timing diff (the CAUSE) ────────────────────────────────────────

export interface SegShift {
  id: string;
  start: number; // new start (absolute s)
  deltaStart: number;
  /** change in the segment's OWN duration — the fingerprint of a re-narration at
   *  the EDIT SITE (its content got longer/shorter). A pure downstream beat has
   *  deltaDuration≈0 and only a deltaStart pushed by an upstream edit. */
  deltaDuration: number;
  added: boolean;
  removed: boolean;
}

/** Read `<ref>:<path>` from git as text; null when not a repo / not tracked. */
function gitShow(ref: string, absPath: string): string | null {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dirname(absPath),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const rel = relative(root, absPath);
    return execFileSync('git', ['show', `${ref}:${rel}`], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString('utf8');
  } catch {
    return null;
  }
}

/** Segment-by-id delta between two narration timings (older `a` → current `b`). */
export function diffTiming(a: NarrationTiming, b: NarrationTiming): SegShift[] {
  const old = new Map(a.segments.map((s) => [s.id, s]));
  const shifts: SegShift[] = [];
  for (const s of b.segments) {
    const prev = old.get(s.id);
    shifts.push({
      id: s.id,
      start: s.start,
      deltaStart: prev ? s.start - prev.start : 0,
      deltaDuration: prev ? s.duration - prev.duration : 0,
      added: !prev,
      removed: false,
    });
    old.delete(s.id);
  }
  for (const [id, s] of old) {
    shifts.push({ id, start: s.start, deltaStart: 0, deltaDuration: 0, added: false, removed: true });
  }
  return shifts.sort((x, y) => x.start - y.start);
}

const EPS = 1e-4;
const sign = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}s`;

/** Is this shift a re-narration ROOT — a segment whose own content changed
 *  (duration moved) or that was newly added, i.e. an EDIT SITE that pushes
 *  everything downstream of it? */
function isRoot(s: SegShift): boolean {
  return s.added || Math.abs(s.deltaDuration) > EPS;
}

/**
 * One-line cause for a frame at time `t`. A re-narration that re-records one line
 * changes that segment's DURATION (not its start) and pushes every later segment's
 * start by the same amount — so attribution has two jobs:
 *   • name the EDIT SITE by its duration change (its start doesn't move), and
 *   • trace a purely-shifted downstream beat back to the ROOT that pushed it,
 *     rather than letting it claim its own (derived) shift.
 */
export function causeFor(t: number, shifts: SegShift[]): string | undefined {
  const before = shifts.filter((s) => s.start <= t + EPS && !s.removed);
  const active = before[before.length - 1];
  if (!active) return undefined;
  if (active.added) return `${active.id}: new segment`;
  // the edit site: this segment's OWN duration changed (it was re-narrated). Its
  // start may not have moved, so duration — not start — is what identifies it.
  if (Math.abs(active.deltaDuration) > EPS) {
    return `${active.id} re-narrated (${sign(active.deltaDuration)} duration): re-narration`;
  }
  // the nearest upstream edit that explains a downstream shift (before `active`)
  const root = before.slice(0, -1).reverse().find(isRoot);
  if (Math.abs(active.deltaStart) > EPS) {
    // start moved but own duration didn't → it's downstream of an earlier edit
    if (root) return `downstream of ${root.id} (${sign(active.deltaStart)}): re-narration`;
    return `${active.id} moved ${sign(active.deltaStart)}: re-narration`; // independent move, no clear root
  }
  // active is unmoved, but an upstream edit may still reflow into this frame
  if (root) return `downstream of ${root.id} (${sign(root.deltaDuration)}): re-narration`;
  return undefined;
}

// ── raster helpers ───────────────────────────────────────────────────────────

async function decodePng(
  buf: Buffer,
): Promise<{ rgba: Uint8ClampedArray; w: number; h: number }> {
  const img = await loadImage(buf);
  const w = img.width;
  const h = img.height;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return { rgba: ctx.getImageData(0, 0, w, h).data, w, h };
}

function goldenPathFor(dir: string, name: string, frame: number): string {
  return join(dir, `${name}-f${String(frame).padStart(4, '0')}.png`);
}

// ── the command ──────────────────────────────────────────────────────────────

export async function repinCommand(opts: RepinOptions): Promise<RepinResult> {
  const fps = opts.fps ?? DEFAULT_FPS;
  const frames = opts.frames ?? DEFAULT_FRAMES;
  const name = opts.name ?? basename(opts.modulePath).replace(/\.[jt]sx?$/, '');
  const onlySet = opts.only ? new Set(opts.only) : null;

  const mod = await loadSceneModule(opts.modulePath);

  // resolve + diff the narration timing sibling for the cause column
  let shifts: SegShift[] = [];
  let causeSource: string | null = null;
  const timingPath = timingPathFor(opts.modulePath);
  if (timingPath) {
    const older = gitShow(opts.since ?? 'HEAD', resolve(timingPath));
    if (older) {
      try {
        const oldT = JSON.parse(older) as NarrationTiming;
        const newT = JSON.parse(readFileSync(timingPath, 'utf8')) as NarrationTiming;
        shifts = diffTiming(oldT, newT);
        causeSource = timingPath;
      } catch {
        /* malformed timing on either side → no cause column, not a hard error */
      }
    }
  }

  if (opts.heatmapDir && !existsSync(opts.heatmapDir)) mkdirSync(opts.heatmapDir, { recursive: true });

  const results: RepinFrame[] = [];
  for (const frame of frames) {
    const t = frame / fps;
    const scene = mod.createScene();
    const backend = new SkiaBackend(scene.size.w, scene.size.h);
    scene.setTextMeasurer(backend);
    backend.render(evaluate(scene, mod.timeline, t));
    const curPng = backend.encodePng();
    const curRgba = await backend.readPixels();

    const goldenPath = goldenPathFor(opts.goldenDir, name, frame);
    const canWrite = opts.write === true && (!onlySet || onlySet.has(frame));

    if (!existsSync(goldenPath)) {
      let wrote = false;
      if (canWrite) {
        mkdirSync(dirname(goldenPath), { recursive: true });
        writeFileSync(goldenPath, curPng);
        wrote = true;
      }
      results.push({ frame, t, status: 'new', wrote });
      continue;
    }

    const goldPng = readFileSync(goldenPath);
    if (curPng.equals(goldPng)) {
      results.push({ frame, t, status: 'identical', wrote: false });
      continue;
    }

    // changed — explain (SSIM) and gate the write
    const rec: RepinFrame = { frame, t, status: 'changed', wrote: false };
    const { rgba: goldRgba, w, h } = await decodePng(goldPng);
    if (w === scene.size.w && h === scene.size.h) {
      const map = ssimMap(goldRgba, curRgba, w, h);
      rec.ssim = map.mean;
      rec.minSsim = map.min;
      if (opts.heatmapDir) {
        const hb = new SkiaBackend(w, h);
        hb.putPixels(heatmapRgba(map, w, h));
        const hp = join(opts.heatmapDir, `${name}-f${String(frame).padStart(4, '0')}.heat.png`);
        writeFileSync(hp, hb.encodePng());
        rec.heatmap = hp;
      }
    }
    const cause = causeFor(t, shifts);
    if (cause) rec.cause = cause;

    const belowFloor =
      opts.floor !== undefined && rec.ssim !== undefined && rec.ssim < opts.floor;
    if (canWrite) {
      if (belowFloor && !opts.force) {
        rec.blocked = true;
      } else {
        writeFileSync(goldenPath, curPng);
        rec.wrote = true;
      }
    }
    results.push(rec);
  }

  const changed = results.filter((r) => r.status === 'changed' || r.status === 'new').length;
  const wrote = results.filter((r) => r.wrote).length;
  const blocked = results.filter((r) => r.blocked).length;
  return { frames: results, changed, wrote, blocked, causeSource, report: formatReport(name, opts, { frames: results, changed, wrote, blocked, causeSource }) };
}

function formatReport(
  name: string,
  opts: RepinOptions,
  r: Pick<RepinResult, 'frames' | 'changed' | 'wrote' | 'blocked' | 'causeSource'>,
): string {
  const lines: string[] = [];
  const mode = opts.write ? (opts.only ? 'write (--only)' : 'write') : 'dry-run';
  lines.push(`gs repin '${name}' — ${r.frames.length} frames, ${r.changed} changed [${mode}]`);
  if (r.causeSource) lines.push(`  cause ← ${r.causeSource} vs ${opts.since ?? 'HEAD'}`);
  else lines.push(`  (no narration timing sibling diffed — perceptual delta only)`);
  // the lowest-SSIM changed frame is the likely EDIT SITE / root: a content edit
  // drops SSIM hard, while a pure downstream time-shift barely dents it. Mark it —
  // it's the culprit-finder even when no timing sibling can name a cause.
  let worstFrame = -1;
  let worstSsim = Infinity;
  for (const f of r.frames) {
    if ((f.status === 'changed') && f.ssim !== undefined && f.ssim < worstSsim) {
      worstSsim = f.ssim;
      worstFrame = f.frame;
    }
  }
  const marked = r.changed > 1 && worstFrame >= 0;
  for (const f of r.frames) {
    if (f.status === 'identical') continue;
    const fno = `f${String(f.frame).padStart(4, '0')}`;
    if (f.status === 'new') {
      lines.push(`  ${fno}  NEW        ${f.wrote ? '→ written' : '(dry-run)'}`);
      continue;
    }
    const perc =
      f.ssim !== undefined
        ? `ssim ${f.ssim.toFixed(4)} (min ${f.minSsim!.toFixed(3)})`
        : `dimensions changed`;
    const tail = f.blocked
      ? '⚠ BELOW FLOOR — refused (use --force)'
      : f.wrote
        ? '→ re-pinned'
        : '(dry-run)';
    const editMark = marked && f.frame === worstFrame ? '◀ likely edit-site (lowest SSIM)  ' : '';
    lines.push(`  ${fno}  ${perc}  ${f.cause ? `— ${f.cause}  ` : ''}${editMark}${tail}`);
  }
  if (!opts.write && r.changed > 0) {
    lines.push(`  ${r.changed} stale — re-run with --write to re-pin${opts.floor !== undefined ? ` (floor ${opts.floor})` : ''}`);
  }
  if (r.blocked > 0) lines.push(`  ${r.blocked} refused below floor — inspect the heat-map, then --force if intended`);
  return lines.join('\n');
}

/**
 * gs verify-determinism (DESIGN.md §5.5/§5.6 §7): the cross-shard / cross-machine
 * divergence LOCATOR. It is the VERIFIER of the determinism tenet — it never
 * perturbs the contract: it evaluates under the SAME `withDeterminismGuards('throw')`
 * as `gs render`, hashes the SAME raw RGBA the FFmpeg pipe consumes, and reuses the
 * SHIPPED DisplayList serializer for the per-node sub-hashes. It renders no new
 * pixels through a path the goldens don't already pin.
 *
 * The authoritative byte check is the per-frame `sha256(RGBA)` over the raw
 * `backend.readPixels()` (NOT `encodePng` — sidestepping any PNG-encoder
 * nondeterminism). The per-node sub-hashes LOCALIZE where a frame diverged; they
 * are a locator, not the authority — a node whose isolated emit() depends on the
 * parent CTM may sub-hash differently in isolation than it draws in context.
 *
 * HONEST SCOPE (§5.5 item 6): the byte-equality guarantee is Skia↔Skia ONLY
 * (cross-machine / cross-shard, same pinned toolchain). Browser↔Skia is perceptual
 * (SSIM), never byte-identity — so comparing a non-Skia manifest by byte-hash is a
 * CATEGORY ERROR and is REJECTED with a clear error. The manifest stamps `backend`
 * so an `--against` cross-backend compare is caught.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  createDisplayListBuilder,
  diffDisplayLists,
  evaluate,
  formatDisplayDiff,
  serializeDisplayList,
  withDeterminismGuards,
  type DisplayList,
  type Scene,
  type SceneModule,
} from '@glissade/scene';
import type { EvalContext, Node } from '@glissade/scene';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import { SceneModuleError } from './render.js';
import { splitFrameRange } from './shards.js';

/**
 * Load a scene module with a FRESH module cache (`moduleCache: false`), so each
 * call re-runs the module's top level from scratch — exactly what a separate `gs`
 * shard process does. This is the faithful in-process model of cross-process
 * sharding: it resets any module-level state (the §5.5-item-5 cross-frame
 * accumulation a render shard child wouldn't share), so a stateful impurity
 * actually diverges here instead of being masked by a shared module instance.
 */
async function freshLoadSceneModule(modulePath: string): Promise<SceneModule> {
  const abs = isAbsolute(modulePath) ? modulePath : resolve(process.cwd(), modulePath);
  const jiti = createJiti(pathToFileURL(process.cwd() + '/').href, { moduleCache: false });
  const loaded = (await jiti.import(pathToFileURL(abs).href, { default: true })) as Partial<SceneModule>;
  if (typeof loaded?.createScene !== 'function' || loaded?.timeline === undefined) {
    throw new SceneModuleError(modulePath, 'default export is not a SceneModule');
  }
  return loaded as SceneModule;
}

/** Manifest schema version — committed baselines carry the same break-policy obligation as a .dl.json. */
export const MANIFEST_VERSION = 1 as const;

/** The byte-equality guarantee is Skia↔Skia only (§5.5 item 6); the manifest stamps which raster produced it. */
export type ManifestBackend = 'skia';

export interface FrameEntry {
  /** inclusive frame index. */
  frame: number;
  /** sha256 of the raw RGBA bytes (the AUTHORITATIVE byte check). */
  hash: string;
  /**
   * Per-node DisplayList sub-hashes (node id → sha256 of the node's isolated emit).
   * A LOCATOR for where a divergent frame differs — not the byte authority.
   */
  nodes: Record<string, string>;
}

export interface FramesManifest {
  manifestVersion: typeof MANIFEST_VERSION;
  /** which rasterizer produced the RGBA hashes — gates a cross-backend byte-compare. */
  backend: ManifestBackend;
  size: { w: number; h: number };
  fps: number;
  /**
   * Node ids that are CONTAINERS (Group): their isolated emit recurses into
   * children, so a container's sub-hash diverges whenever ANY descendant does.
   * Localization prefers a non-container leaf (the specific culprit) and only
   * falls back to a container when its OWN transform/props diverged — mirroring
   * `auditCacheCold`'s groupFallback.
   */
  groups: string[];
  frames: FrameEntry[];
}

export class VerifyDeterminismError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerifyDeterminismError';
  }
}

/** sha256 hex of arbitrary bytes / string (the committed-byte-hash precedent — node:crypto, no BLAKE3). */
function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Per-node DisplayList sub-hashes for one frame: each node's emit() in ISOLATION,
 * serialized through the SHIPPED `serializeDisplayList` (the byte-preserving
 * collapse serializer that backs `.dl.json` + the cacheKey), then sha256'd. This
 * mirrors `auditCacheCold`'s per-node emit — the divergence locator.
 */
function nodeSubHashes(scene: Scene, ctx: EvalContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, node] of scene.nodes) {
    const b = createDisplayListBuilder(scene.size);
    (node as Node).emit(b, ctx);
    out[id] = sha256(serializeDisplayList(b.finish()));
  }
  return out;
}

/**
 * Build a frames manifest for an inclusive frame range. Each frame is evaluated
 * under `withDeterminismGuards('throw')` (EXACTLY as render.ts does — any
 * clock/random/timer call in scene code throws HERE during verification),
 * rasterized on Skia, and the raw RGBA from `readPixels()` is sha256'd.
 *
 * Asset loading (fonts/images/video) is intentionally out of scope: this is a
 * geometry/raster determinism probe over the pure DisplayList path. A scene with
 * external assets still verifies its drawn output; unregistered fonts fall back
 * deterministically (the same as the linear render path with no registration).
 */
export async function buildManifest(
  mod: SceneModule,
  first: number,
  last: number,
  fpsOverride?: number,
): Promise<FramesManifest> {
  const { SkiaBackend } = await import('@glissade/backend-skia');
  const scene = mod.createScene();
  const doc = mod.timeline;
  const fps = fpsOverride ?? doc.fps ?? 60;
  const backend = new SkiaBackend(scene.size.w, scene.size.h);
  scene.setTextMeasurer(backend);

  const frames: FrameEntry[] = [];
  for (let f = first; f <= last; f++) {
    const t = f / fps;
    // §5.5: the verify path rejects any wall-clock/random/timer call in evaluate().
    const dl: DisplayList = withDeterminismGuards('throw', () => evaluate(scene, doc, t));
    backend.render(dl);
    const rgba = await backend.readPixels();
    const ctx: EvalContext = {
      time: t,
      frame: doc.fps !== undefined ? Math.round(t * doc.fps) : Math.round(t * fps),
      measurer: scene.textMeasurer,
    };
    frames.push({
      frame: f,
      hash: sha256(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength)),
      nodes: nodeSubHashes(scene, ctx),
    });
  }
  backend.dispose();

  // Duck-type a CONTAINER (has a `children` array): a scene module loaded under a
  // separate module realm (the verify shard loader) makes `instanceof Group` fail
  // across realms, so detect the recursing-emit shape structurally instead.
  const groups: string[] = [];
  for (const [id, node] of scene.nodes) {
    if (Array.isArray((node as { children?: unknown }).children)) groups.push(id);
  }

  return { manifestVersion: MANIFEST_VERSION, backend: 'skia', size: scene.size, fps, groups, frames };
}

export function serializeManifest(m: FramesManifest): string {
  return JSON.stringify(m, null, 2);
}

export function parseManifest(json: string): FramesManifest {
  const doc = JSON.parse(json) as Partial<FramesManifest>;
  if (doc.manifestVersion !== MANIFEST_VERSION) {
    throw new VerifyDeterminismError(
      `unsupported manifestVersion ${String(doc.manifestVersion)}; this build reads ${MANIFEST_VERSION}`,
    );
  }
  if (doc.backend === undefined || !doc.size || doc.fps === undefined || !Array.isArray(doc.frames) || !Array.isArray(doc.groups)) {
    throw new VerifyDeterminismError('malformed frames.manifest (need backend, size, fps, groups[], frames[])');
  }
  return doc as FramesManifest;
}

/** A localized divergence: which frame, which node, and the command-level delta (when one node localizes it). */
export interface Divergence {
  frame: number;
  /** the full-frame RGBA hashes that differ (the authoritative mismatch). */
  hash: { a: string; b: string };
  /** the first node whose sub-hash differs (the locator) — absent if only the frame hash differs. */
  node?: string;
  /** a human-readable command-level drill of the divergent node (only with --bisect). */
  bisect?: string;
}

export interface VerifyResult {
  ok: boolean;
  /** number of frames compared. */
  frames: number;
  /** the first divergence (the bisected (frame, node, op)), when !ok. */
  divergence?: Divergence;
  /** a human-readable report. */
  report: string;
}

/**
 * Compare two manifests frame-by-frame. The full-frame RGBA hash is authoritative;
 * the per-node sub-hashes localize WHERE a divergent frame differs. Stops at the
 * FIRST divergent frame (the bisect target).
 */
function compareManifests(
  a: FramesManifest,
  b: FramesManifest,
): { ok: boolean; divergence?: Divergence; compared: number; reason?: string } {
  if (a.backend !== b.backend) {
    // Defensive: callers reject cross-backend before reaching here, but a
    // committed manifest could carry a foreign backend tag.
    throw new VerifyDeterminismError(
      `cross-backend byte-compare rejected: '${a.backend}' vs '${b.backend}'. ` +
        'Byte-equality is a Skia↔Skia (cross-machine/shard) guarantee only; ' +
        'browser↔Skia is perceptual (SSIM) parity, never byte-identity (§5.5 item 6).',
    );
  }
  // INCOMPARABLE GRID: an fps or size mismatch means the two manifests sample
  // DIFFERENT wall-clock times per frame index (fps) or hash DIFFERENT-shaped RGBA
  // buffers (size). Comparing frame N of one against frame N of the other would be a
  // category error — a false divergence (same index, different time/grid) or a false
  // match. Surface it loudly instead of silently byte-comparing the wrong frames.
  if (a.fps !== b.fps || a.size.w !== b.size.w || a.size.h !== b.size.h) {
    return {
      ok: false,
      compared: 0,
      reason:
        `incomparable: baseline fps/size differs ` +
        `(a: ${a.fps}fps ${a.size.w}x${a.size.h} vs b: ${b.fps}fps ${b.size.w}x${b.size.h}). ` +
        'Same frame index = different wall-clock time when fps differs; a different ' +
        'size yields an incomparable RGBA hash. Re-render the baseline at the same fps/size.',
    };
  }
  const byFrameB = new Map(b.frames.map((e) => [e.frame, e]));
  let compared = 0;
  let absent = 0;
  for (const ea of a.frames) {
    const eb = byFrameB.get(ea.frame);
    if (!eb) {
      // a baseline frame absent from the render set — NOT a silent skip: a fully
      // or partially disjoint range must surface (see the compared===0 gate below).
      absent++;
      continue;
    }
    compared++;
    if (ea.hash === eb.hash) continue;
    // authoritative mismatch — localize to the first divergent node sub-hash,
    // PREFERRING a non-container leaf (a Group's isolated emit recurses into its
    // children, so it diverges whenever any descendant does; the leaf is the
    // specific culprit). Fall back to a container only if no leaf diverged —
    // mirrors `auditCacheCold`'s groupFallback.
    const groups = new Set(a.groups);
    let node: string | undefined;
    let groupFallback: string | undefined;
    for (const [id, ha] of Object.entries(ea.nodes)) {
      // A baseline node id ABSENT from the current frame (renamed/removed node) is
      // not a divergence to pin on it — the localizer would cry wolf on a node that
      // no longer exists. Skip it; the authoritative frame-hash mismatch still
      // stands, and a genuinely-divergent present node still gets blamed.
      if (!(id in eb.nodes)) continue;
      if (eb.nodes[id] === ha) continue;
      if (groups.has(id)) {
        groupFallback ??= id;
        continue;
      }
      node = id;
      break;
    }
    node ??= groupFallback;
    return {
      ok: false,
      compared,
      divergence: { frame: ea.frame, hash: { a: ea.hash, b: eb.hash }, ...(node !== undefined ? { node } : {}) },
    };
  }
  // ZERO frames compared = the baseline and render frame sets are disjoint (e.g. a
  // non-overlapping --range). A `{ok:true, compared:0}` here would be a FALSE GREEN:
  // the gate meant to catch drift would silently mask it (nothing was compared). So
  // a 0-overlap compare is a FAILURE, not a pass.
  if (compared === 0) {
    return {
      ok: false,
      compared,
      reason: `0 frames compared (baseline/render range disjoint): the baseline has ${a.frames.length} frame(s), none present in the render set of ${b.frames.length}`,
    };
  }
  // a PARTIAL overlap is a pass for what overlapped, but warn that some baseline
  // frames went uncompared (a narrowed --range silently shrinking coverage).
  if (absent > 0) {
    return {
      ok: true,
      compared,
      reason: `warning: ${absent} baseline frame(s) absent from the render set were not compared (compared ${compared})`,
    };
  }
  return { ok: true, compared };
}

/**
 * Replay a fresh scene through frames `[from..frame]` to reach the SAME module
 * state the divergent render had at `frame`, then return the divergent NODE's
 * isolated DisplayList at `frame`. Replaying the leading frames is what makes a
 * cross-frame-state impurity reproduce here: the linear side replays from the
 * range start, the shard side replays from the shard's sub-range start, so a
 * counter/accumulator reaches different values exactly as it did in the manifests.
 */
function replayNodeEmit(mod: SceneModule, from: number, frame: number, fps: number, node: string): DisplayList | undefined {
  const scene = mod.createScene();
  const target = scene.nodes.get(node);
  if (!target) return undefined;
  const docFps = mod.timeline.fps;
  return withDeterminismGuards('throw', () => {
    // Evaluate the leading frames IN ORDER (each write the scene playhead + pull
    // the signal graph, accumulating any module state), ending with a full
    // evaluate AT `frame` so the playhead is current before the per-node emit —
    // signals read scene.playhead, not the hand-built ctx, so the frame must be
    // evaluated, not just emitted with a frame-`frame` context.
    for (let f = from; f <= frame; f++) evaluate(scene, mod.timeline, f / fps);
    const t = frame / fps;
    const ctx: EvalContext = {
      time: t,
      frame: docFps !== undefined ? Math.round(t * docFps) : Math.round(t * fps),
      measurer: scene.textMeasurer,
    };
    const b = createDisplayListBuilder(scene.size);
    (target as Node).emit(b, ctx);
    return b.finish();
  });
}

/** A bisect drill: two replay contexts (linear-side `from`, shard-side `from`) for the divergent node at `frame`. */
interface BisectPlan {
  modulePath: string;
  node: string;
  frame: number;
  fps: number;
  /** the linear side replays from this frame (the verify range start). */
  fromA: number;
  /** the diverging side replays from this frame (the shard sub-range start). */
  fromB: number;
}

/** Produce the command-level drill (`diffDisplayLists` + `formatDisplayDiff`) of the divergent node. */
async function runBisect(plan: BisectPlan): Promise<string> {
  const modA = await freshLoadSceneModule(plan.modulePath);
  const modB = await freshLoadSceneModule(plan.modulePath);
  const dlA = replayNodeEmit(modA, plan.fromA, plan.frame, plan.fps, plan.node);
  const dlB = replayNodeEmit(modB, plan.fromB, plan.frame, plan.fps, plan.node);
  if (!dlA || !dlB) return `node '${plan.node}' is not present in both scenes — cannot drill`;
  return formatDisplayDiff(diffDisplayLists(dlA, dlB));
}

export interface VerifyOptions {
  modulePath: string;
  /** diff a linear render vs an N-shard render of the same range (default: no shard check). */
  shards?: number;
  /** diff against a committed / other-machine frames.manifest. */
  against?: string;
  /** inclusive frame range [first, last]; default the whole timeline. */
  frameRange?: [number, number];
  /** drill the first divergence to the (frame, node, op) via the command-level diff. */
  bisect?: boolean;
  /** fps override (default: timeline fps, else 60). */
  fps?: number;
  /** instead of comparing, write the linear manifest to this path. */
  emit?: string;
}

/**
 * Resolve the inclusive frame range to verify. Mirrors render.ts: an explicit
 * --range wins; otherwise the whole timeline [0, ceil(duration*fps)-1].
 */
async function resolveRange(mod: SceneModule, opts: VerifyOptions): Promise<{ first: number; last: number; fps: number }> {
  const fps = opts.fps ?? mod.timeline.fps ?? 60;
  if (opts.frameRange) {
    const [a, b] = opts.frameRange;
    return { first: a, last: Math.max(a, b), fps };
  }
  const { compileTimeline } = await import('@glissade/core');
  const duration = compileTimeline(mod.timeline).duration;
  return { first: 0, last: Math.max(0, Math.ceil(duration * fps) - 1), fps };
}

export async function verifyDeterminismCommand(opts: VerifyOptions): Promise<VerifyResult> {
  const mod = await freshLoadSceneModule(opts.modulePath);
  const { first, last, fps } = await resolveRange(mod, opts);

  // --emit: write the linear manifest and stop (the baseline writer).
  if (opts.emit !== undefined) {
    const manifest = await buildManifest(mod, first, last, fps);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(opts.emit, serializeManifest(manifest));
    return {
      ok: true,
      frames: manifest.frames.length,
      report: `wrote ${manifest.frames.length}-frame manifest (frames ${first}..${last}) → ${opts.emit}`,
    };
  }

  // The linear reference manifest.
  const linear = await buildManifest(mod, first, last, fps);

  // --against: diff a committed / other-machine manifest (REJECT cross-backend).
  if (opts.against !== undefined) {
    const baseline = parseManifest(readFileSync(opts.against, 'utf8'));
    if (baseline.backend !== linear.backend) {
      throw new VerifyDeterminismError(
        `cross-backend byte-compare rejected: baseline '${opts.against}' is backend ` +
          `'${baseline.backend}', this render is '${linear.backend}'. Byte-equality is a ` +
          'Skia↔Skia (cross-machine/shard) guarantee only; browser↔Skia is perceptual ' +
          '(SSIM) parity, never byte-identity (§5.5 item 6). Use SSIM parity for cross-backend.',
      );
    }
    const cmp = compareManifests(baseline, linear);
    // An --against baseline is just hashes — there's no scene to replay for the
    // committed side, so a command-level drill isn't available; the manifest's
    // node sub-hash already localizes the divergence.
    return finalize(cmp, opts, `linear render vs baseline ${opts.against}`, undefined);
  }

  // --shards N: diff a linear render vs an N-shard render of the same range. Each
  // shard re-runs the scene module from scratch over its contiguous sub-range
  // (exactly what a `gs render --workers` shard child does), then the shard
  // sub-manifests are concatenated and compared to the linear manifest.
  if (opts.shards !== undefined && opts.shards > 1) {
    const ranges = splitFrameRange(first, last, opts.shards);
    const shardFrames: FrameEntry[] = [];
    for (const r of ranges) {
      // a FRESH module load per shard = the faithful in-process cross-process
      // re-eval: a brand-new scene graph + binding caches AND reset module-level
      // state (what a separate `gs` shard child gets), so a stateful impurity
      // diverges here instead of riding a shared module instance.
      const shardMod = await freshLoadSceneModule(opts.modulePath);
      const sub = await buildManifest(shardMod, r.first, r.last, fps);
      shardFrames.push(...sub.frames);
    }
    const sharded: FramesManifest = { ...linear, frames: shardFrames };
    const cmp = compareManifests(linear, sharded);
    // The divergent frame's shard sub-range start is the shard side's replay
    // origin (fromB); the linear side replays from the verify range start (first).
    const bisectFor = (d: Divergence): BisectPlan | undefined => {
      if (d.node === undefined) return undefined;
      const shard = ranges.find((r) => d.frame >= r.first && d.frame <= r.last);
      return {
        modulePath: opts.modulePath,
        node: d.node,
        frame: d.frame,
        fps,
        fromA: first,
        fromB: shard?.first ?? first,
      };
    };
    return finalize(cmp, opts, `linear vs ${ranges.length}-shard render (frames ${first}..${last})`, bisectFor);
  }

  // No comparison target: just confirm the manifest builds (the guards held — no
  // clock/random in scene code), the smallest useful verification.
  return {
    ok: true,
    frames: linear.frames.length,
    report:
      `built a ${linear.frames.length}-frame manifest (frames ${first}..${last}) under determinism guards — ` +
      'no clock/random violation. Pass --shards N or --against <manifest> to byte-compare.',
  };
}

/** Shared tail: build the report + optional --bisect drill for a comparison result. */
async function finalize(
  cmp: { ok: boolean; divergence?: Divergence; compared: number; reason?: string },
  opts: VerifyOptions,
  label: string,
  bisectFor: ((d: Divergence) => BisectPlan | undefined) | undefined,
): Promise<VerifyResult> {
  if (cmp.ok) {
    const tail = cmp.reason !== undefined ? `\n  ${cmp.reason}` : '';
    return {
      ok: true,
      frames: cmp.compared,
      report: `byte-identical: ${cmp.compared} frames match (${label})${tail}`,
    };
  }
  // A failure with no divergence is a 0-overlap (nothing compared) — surface the
  // reason loudly rather than letting it read as a green pass.
  if (cmp.divergence === undefined) {
    return {
      ok: false,
      frames: cmp.compared,
      report: `VERIFY FAILED (${label})\n  ${cmp.reason ?? '0 frames compared'}`,
    };
  }
  const d = cmp.divergence;
  let report =
    `DIVERGENCE (${label})\n` +
    `  frame ${d.frame}: RGBA sha256 ${d.hash.a.slice(0, 16)}… != ${d.hash.b.slice(0, 16)}…\n` +
    (d.node !== undefined
      ? `  first divergent node: '${d.node}' (sub-hash locator)`
      : '  no per-node sub-hash differs (a parent-CTM / composite effect localized the frame hash only)');
  if (opts.bisect && d.node !== undefined) {
    const plan = bisectFor?.(d);
    if (plan) {
      const drill = await runBisect(plan);
      d.bisect = drill;
      report += `\n  --bisect drill (node '${d.node}' @ frame ${d.frame}):\n${drill.replace(/^/gm, '    ')}`;
    } else {
      report += `\n  --bisect: no command-level drill available (an --against baseline carries hashes, not a scene)`;
    }
  }
  return { ok: false, frames: cmp.compared, divergence: d, report };
}

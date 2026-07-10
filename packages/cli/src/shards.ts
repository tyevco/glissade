/**
 * Sharded export (DESIGN.md §5.6, §8.1 item 1): `gs render --workers N` splits
 * the frame range into N contiguous sub-ranges, renders each in a SEPARATE `gs`
 * child process (NOT worker_threads — @napi-rs/canvas / GlobalFonts hold unsafe
 * process-global state), then joins the shard videos with the FFmpeg concat
 * demuxer. Determinism is frame-level: every shard re-runs the scene module from
 * scratch (re-deriving any module-level `bake()` for its prefix), so an N-worker
 * render of a range is byte-identical to a single-worker render of the same range
 * at the PNG level; the join is pure engineering above the purity guarantee.
 *
 * Two join strategies (the §8.1 decision):
 *   - default: per-shard encode with a forced keyframe at each range start +
 *     identical encoder settings, concat-demuxer copy.
 *   - --lossless-intermediate: FFV1 shards + a single final encode. Forced on
 *     automatically when the picked encoder can't honor precise boundary
 *     keyframes (mpeg4 / openh264) — a concat-copy of imprecise-GOP codecs drops
 *     or dupes boundary frames, so it would not be byte-faithful.
 *
 * GPU/shader scenes are outside the cross-process reproducibility guarantee
 * (§3.7), so a scene containing a ShaderEffect refuses to shard without
 * --allow-gpu-shards.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShaderEffect, evaluate, withDeterminismGuards, type Scene } from '@glissade/scene';
import type { CompiledTimeline } from '@glissade/core';
import { pickEncoder } from './encoders.js';
import { planFinalAudio, videoQualityArgs, videoQualityKey, type RenderOptions } from './render.js';
import { planIncremental, type SpliceSegment } from './incremental.js';
import { readRenderManifest, writeRenderManifest, frameKeyDigest, type RenderManifest } from './renderManifest.js';

/** Encoders that can't place a keyframe exactly on a forced boundary → not concat-copy-safe. */
const IMPRECISE_KEYFRAME_ENCODERS = new Set(['mpeg4', 'libopenh264']);

export class ShardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShardError';
  }
}

export interface ShardRange {
  /** inclusive first frame */
  first: number;
  /** inclusive last frame */
  last: number;
}

/**
 * Split inclusive `[first, last]` into up to `workers` contiguous sub-ranges,
 * front-loading the remainder so earlier shards are at most one frame larger.
 * Never returns more ranges than there are frames.
 */
export function splitFrameRange(first: number, last: number, workers: number): ShardRange[] {
  const totalFrames = last - first + 1;
  const n = Math.min(Math.max(1, Math.floor(workers)), totalFrames);
  const base = Math.floor(totalFrames / n);
  const extra = totalFrames % n;
  const ranges: ShardRange[] = [];
  let cursor = first;
  for (let i = 0; i < n; i++) {
    const len = base + (i < extra ? 1 : 0);
    ranges.push({ first: cursor, last: cursor + len - 1 });
    cursor += len;
  }
  return ranges;
}

/** Does this scene contain a GPU/shader node (outside the §3.7 determinism guarantee)? */
export function sceneHasGpuNodes(scene: Scene): boolean {
  for (const node of scene.nodes.values()) {
    if (node instanceof ShaderEffect) return true;
  }
  return false;
}

/**
 * Resolve the built `gs` CLI entry. In production this module is `dist/shards.js`,
 * so the sibling `dist/cli.js` is the entry. Under test/source the sibling
 * `cli.js` doesn't exist, so fall back to the package's built `dist/cli.js`.
 */
function cliEntry(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const sibling = resolve(here, 'cli.js');
  if (existsSync(sibling)) return sibling;
  const dist = resolve(here, '..', 'dist', 'cli.js');
  if (existsSync(dist)) return dist;
  return sibling; // surfaces a clear MODULE_NOT_FOUND if neither was built
}

export interface RenderShardedArgs {
  opts: RenderOptions;
  scene: Scene;
  compiled: CompiledTimeline;
  fps: number;
  duration: number;
  firstFrame: number;
  lastFrame: number;
  container: 'mp4' | 'webm';
  workers: number;
  timingPathFor: (modulePath: string) => string | null;
  writeCaptionSidecars: (timingPath: string, target: string) => { srt: string; vtt: string };
  writeCueSidecars: (
    target: string,
    markers: CompiledTimeline['markers'],
    duration: number,
    chapters: boolean,
    chapterKinds?: ReadonlySet<string>,
  ) => string[];
}

/**
 * Orchestrate a sharded render. Returns the same `{ frames, out }` shape as the
 * linear `render()`. Throws on a GPU scene without --allow-gpu-shards, or on any
 * child / ffmpeg failure.
 */
export async function renderSharded(a: RenderShardedArgs): Promise<{ frames: number; out: string }> {
  const { opts, scene, compiled, fps, duration, firstFrame, lastFrame, container } = a;
  const tier: 'preview' | 'final' = opts.tier ?? 'final';

  // §3.7 guard: sharded GPU output isn't reproducible across processes.
  if (sceneHasGpuNodes(scene) && !opts.allowGpuShards) {
    throw new ShardError(
      'this scene contains a GPU/shader node, whose output is not reproducible across shard ' +
        'processes (§3.7). Re-run with --allow-gpu-shards to override, or render single-threaded ' +
        '(drop --workers).',
    );
  }

  // Cap the rendered range to the timeline extent — the linear path renders the
  // full requested range then trims the encode with `-t <duration>`; a copy-mode
  // `-t` on the concat join is NOT frame-accurate (cuts 1-2 frames early), so we
  // instead cap the FRAMES so the shard output equals the linear output exactly.
  // `ceil(duration*fps)` is the frame count `-t <duration>` yields at this fps.
  const effectiveLast = Math.min(lastFrame, Math.ceil(duration * fps) - 1);
  const ranges = splitFrameRange(firstFrame, effectiveLast, a.workers);
  const total = effectiveLast - firstFrame + 1;
  const outAbs = resolve(opts.out);
  mkdirSync(dirname(outAbs), { recursive: true });

  // Decide the join strategy / shard codec up front. The default GOP-aligned
  // concat-copy only works if the final encoder honors precise boundary
  // keyframes; otherwise fall back to lossless FFV1 shards + a single re-encode.
  const finalEnc = pickEncoder('video', container);
  if (finalEnc.note) process.stderr.write(`note: ${finalEnc.note}\n`);
  let lossless = opts.losslessIntermediate === true;
  if (!lossless && IMPRECISE_KEYFRAME_ENCODERS.has(finalEnc.name)) {
    lossless = true;
    process.stderr.write(
      `note: '${finalEnc.name}' can't honor precise shard-boundary keyframes; ` +
        'falling back to --lossless-intermediate (FFV1 shards + one final encode) for a byte-faithful join\n',
    );
  }

  const work = mkdtempSync(join(tmpdir(), 'glissade-shards-'));
  const shardVideos: string[] = [];
  let done = 0;
  try {
    process.stderr.write(
      `sharding ${total} frames across ${ranges.length} worker${ranges.length === 1 ? '' : 's'}` +
        `${lossless ? ' (lossless intermediate)' : ''}\n`,
    );

    for (let i = 0; i < ranges.length; i++) {
      const { first, last } = ranges[i]!;
      const shardFrames = join(work, `shard-${String(i).padStart(3, '0')}-frames`);
      mkdirSync(shardFrames, { recursive: true });

      // Each shard re-runs the scene module in a fresh `gs` child process,
      // rendering ITS sub-range to a PNG sequence (video-only; no audio mix /
      // sidecars — the orchestrator does those once over the join).
      const childArgs = [
        cliEntry(),
        'render',
        opts.modulePath,
        '--out', shardFrames,
        '--range', `${first}..${last}`,
        '--format', 'png-seq',
        '--fps', String(fps),
        // suppress audio auto-mix in children (png-seq ignores audio anyway)
        '--narration', 'off',
        '--music', 'off',
        '--sfx', 'off',
        ...(opts.captions ? ['--captions', opts.captions] : []),
        ...(opts.trace !== undefined ? ['--trace', opts.trace] : []),
        ...(opts.state !== undefined ? ['--state', opts.state] : []),
        ...(opts.force ? ['--force'] : []),
        ...(opts.strictFonts ? ['--strict'] : []),
        ...(opts.allowSystemFonts ? ['--allow-system-fonts'] : []),
      ];
      const child = spawnSync(process.execPath, childArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
      if (child.status !== 0) {
        throw new ShardError(
          `shard ${i} (frames ${first}..${last}) failed (exit ${child.status}):\n` +
            `${child.stderr?.toString().slice(-2000) ?? ''}`,
        );
      }

      // Encode the shard frames → a shard video. The default path encodes to the
      // FINAL codec with a forced keyframe at frame 0 of every shard (GOP-aligned
      // concat boundary); the lossless path encodes FFV1.
      const ext = container === 'webm' && !lossless ? 'webm' : 'mkv';
      const shardVideo = join(work, `shard-${String(i).padStart(3, '0')}.${ext}`);
      const codecArgs = lossless
        ? ['-c:v', 'ffv1', '-level', '3']
        : [
            '-c:v', finalEnc.name,
            ...videoQualityArgs(finalEnc.name, tier),
            // a keyframe on frame 0 of each shard → clean concat-copy boundaries
            '-force_key_frames', '0',
            ...(container === 'webm' ? [] : ['-pix_fmt', 'yuv420p']),
          ];
      const encArgs = [
        '-y',
        '-framerate', String(fps),
        '-start_number', String(first),
        '-i', join(shardFrames, 'frame-%05d.png'),
        ...codecArgs,
        shardVideo,
      ];
      const enc = spawnSync('ffmpeg', encArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
      if (enc.status !== 0) {
        throw new ShardError(`shard ${i} encode failed (exit ${enc.status}):\n${enc.stderr?.toString().slice(-2000)}`);
      }
      rmSync(shardFrames, { recursive: true, force: true });
      shardVideos.push(shardVideo);

      done += last - first + 1;
      opts.onProgress?.(done, total);
    }

    // Concat-demuxer join. The concat list points at the shard videos in order.
    const listFile = join(work, 'concat.txt');
    writeFileSync(listFile, shardVideos.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');

    // Audio is mixed ONCE over the concatenated video (shards are video-only).
    const { audioInputs, audioArgs } = await planFinalAudio(opts, [...compiled.audio], duration, container);

    let joinArgs: string[];
    if (lossless) {
      // single final encode of the concatenated lossless stream (+ audio)
      const videoEnc = finalEnc;
      joinArgs = [
        '-y',
        '-f', 'concat', '-safe', '0', '-i', listFile,
        ...audioInputs,
        ...audioArgs,
        '-c:v', videoEnc.name,
        ...videoQualityArgs(videoEnc.name, tier),
        ...(container === 'webm' ? [] : ['-pix_fmt', 'yuv420p', '-movflags', '+faststart']),
        outAbs,
      ];
    } else if (audioArgs.length) {
      // concat-copy the GOP-aligned shard video verbatim; mux the mixed audio in
      joinArgs = [
        '-y',
        '-f', 'concat', '-safe', '0', '-i', listFile,
        ...audioInputs,
        '-c:v', 'copy',
        ...audioArgs,
        ...(container === 'webm' ? [] : ['-movflags', '+faststart']),
        outAbs,
      ];
    } else {
      // no audio: a pure verbatim concat-copy of the GOP-aligned shards
      joinArgs = [
        '-y',
        '-f', 'concat', '-safe', '0', '-i', listFile,
        '-c', 'copy',
        ...(container === 'webm' ? [] : ['-movflags', '+faststart']),
        outAbs,
      ];
    }
    const join_ = spawnSync('ffmpeg', joinArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
    if (join_.status !== 0) {
      throw new ShardError(`shard join failed (exit ${join_.status}):\n${join_.stderr?.toString().slice(-2000)}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  // Sidecars / cues emitted once, over the final joined output.
  if ((opts.captions ?? 'burn') !== 'off') {
    const timingPath = a.timingPathFor(opts.modulePath);
    if (timingPath) {
      const { srt, vtt } = a.writeCaptionSidecars(timingPath, outAbs);
      process.stderr.write(`captions: ${srt}, ${vtt}\n`);
    } else if (opts.captions === 'sidecar') {
      process.stderr.write('note: --captions sidecar: no narration timing manifest found; run gs narrate first\n');
    }
  }
  const cueFiles = a.writeCueSidecars(
    outAbs,
    compiled.markers,
    duration,
    opts.chapters === 'vtt',
    opts.chapterKinds,
  );
  if (cueFiles.length) process.stderr.write(`cues: ${cueFiles.join(', ')}\n`);

  return { frames: total, out: outAbs };
}

// ── 0.41 dirty-beat incremental ────────────────────────────────────────────

/** The FFV1 lossless intermediate retained beside a `--incremental` output for the next splice. */
export function intermediatePathFor(videoPath: string): string {
  return `${videoPath}.gsintermediate.mkv`;
}

export interface RenderIncrementalArgs {
  opts: RenderOptions;
  scene: Scene;
  /** the compiled timeline document passed to evaluate() */
  doc: unknown;
  compiled: CompiledTimeline;
  /** the frameCacheKey context (version|caps|assets) — the same one the linear path builds */
  keyCtx: unknown;
  fps: number;
  duration: number;
  firstFrame: number;
  lastFrame: number;
  container: 'mp4' | 'webm';
  timingPathFor: (modulePath: string) => string | null;
  writeCaptionSidecars: (timingPath: string, target: string) => { srt: string; vtt: string };
  writeCueSidecars: RenderShardedArgs['writeCueSidecars'];
}

/**
 * Dirty-beat incremental render (0.41). Computes the per-frame key vector, diffs
 * it against the prior manifest, and re-renders ONLY the changed frame runs —
 * splicing the unchanged runs verbatim from the retained FFV1 intermediate.
 *
 * ONE pipeline for every outcome: each output segment becomes an FFV1 clip (a
 * `render` segment from a fresh child render; a `keep` segment trimmed losslessly
 * out of the prior intermediate), the clips concat-copy into the new intermediate,
 * and a single final encode produces the output. A cold `--incremental` render is
 * the degenerate all-`render` case, so a warm splice is byte-identical to a cold
 * full render by construction: FFV1 is lossless and intra-only, so a kept segment
 * decodes to the exact pixels a re-render would, and the final encode over the
 * spliced stream is byte-for-byte the cold render. That IS the determinism
 * contract, preserved THROUGH the optimization (the per-frame key is the same
 * proof the frame cache and golden corpus trust).
 */
export async function renderIncremental(a: RenderIncrementalArgs): Promise<{ frames: number; out: string }> {
  const { opts, scene, doc, compiled, keyCtx, fps, duration, firstFrame, lastFrame, container } = a;
  const tier: 'preview' | 'final' = opts.tier ?? 'final';
  const outAbs = resolve(opts.out);
  const total = lastFrame - firstFrame + 1;
  const finalEnc = pickEncoder('video', container);
  if (finalEnc.note) process.stderr.write(`note: ${finalEnc.note}\n`);

  // 1) Key-only pre-pass (evaluate + hash, NO raster) → the new per-frame vector.
  const { frameCacheKey } = await import('./frameCache.js');
  const frameKeys: string[] = [];
  for (let f = firstFrame; f <= lastFrame; f++) {
    const dl = withDeterminismGuards('throw', () => evaluate(scene, doc as never, f / fps));
    frameKeys.push(frameCacheKey(dl, keyCtx as never));
  }
  const newDigest = frameKeyDigest(frameKeys);

  // 2) Plan against the prior manifest + retained intermediate.
  const intermediate = intermediatePathFor(outAbs);
  const prev = readRenderManifest(outAbs);
  const plan = planIncremental(prev, frameKeys, existsSync(intermediate), {
    container, videoCodec: finalEnc.name, fps, firstFrame, frames: total,
  });
  const segments: SpliceSegment[] =
    plan.kind === 'splice' ? [...plan.segments]
    : plan.kind === 'unchanged' ? [{ start: 0, end: total - 1, kind: 'keep' }]
    : [{ start: 0, end: total - 1, kind: 'render' }]; // 'full' (cold, or ineligible → render everything)

  const renderFrames = segments.filter((s) => s.kind === 'render').reduce((n, s) => n + (s.end - s.start + 1), 0);
  process.stderr.write(
    plan.kind === 'splice'
      ? `incremental: ${renderFrames}/${total} frames changed — re-rendering those, splicing ${total - renderFrames} from the intermediate\n`
      : plan.kind === 'unchanged'
        ? `incremental: 0/${total} frames changed — re-using the intermediate verbatim\n`
        : `incremental: full render (${prev ? 'ineligible for splice' : 'no prior intermediate'}) — building the intermediate for next time\n`,
  );

  const work = mkdtempSync(join(tmpdir(), 'glissade-incr-'));
  const segVideos: string[] = [];
  let rendered = 0; // frames actually RE-RENDERED (kept segments splice, they don't render)
  try {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const segVideo = join(work, `seg-${String(i).padStart(3, '0')}.mkv`);
      // FFV1 is pinned to rgb24 on BOTH sources so kept + rendered segments share an
      // identical pixel format → the concat is byte-faithful and the final encode is stable.
      if (seg.kind === 'keep') {
        // Trim [start..end] out of the prior intermediate, losslessly, into an FFV1 clip.
        const trimArgs = [
          '-y', '-i', intermediate,
          '-vf', `trim=start_frame=${seg.start}:end_frame=${seg.end + 1},setpts=PTS-STARTPTS`,
          '-fps_mode', 'passthrough',
          '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'rgb24',
          segVideo,
        ];
        const t = spawnSync('ffmpeg', trimArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
        if (t.status !== 0) throw new ShardError(`incremental keep-trim [${seg.start}..${seg.end}] failed (exit ${t.status}):\n${t.stderr?.toString().slice(-2000)}`);
      } else {
        // Re-render the changed frames in a child `gs` process (absolute frame numbers).
        const segFrames = join(work, `seg-${String(i).padStart(3, '0')}-frames`);
        mkdirSync(segFrames, { recursive: true });
        const first = firstFrame + seg.start;
        const last = firstFrame + seg.end;
        const childArgs = [
          cliEntry(), 'render', opts.modulePath,
          '--out', segFrames,
          '--range', `${first}..${last}`,
          '--format', 'png-seq',
          '--fps', String(fps),
          '--narration', 'off', '--music', 'off', '--sfx', 'off',
          ...(opts.force ? ['--force'] : []),
          ...(opts.strictFonts ? ['--strict'] : []),
          ...(opts.allowSystemFonts ? ['--allow-system-fonts'] : []),
        ];
        const child = spawnSync(process.execPath, childArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
        if (child.status !== 0) throw new ShardError(`incremental render [${first}..${last}] failed (exit ${child.status}):\n${child.stderr?.toString().slice(-2000)}`);
        const enc = spawnSync('ffmpeg', [
          '-y', '-framerate', String(fps), '-start_number', String(first),
          '-i', join(segFrames, 'frame-%05d.png'),
          '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'rgb24',
          segVideo,
        ], { stdio: ['ignore', 'ignore', 'pipe'] });
        if (enc.status !== 0) throw new ShardError(`incremental segment encode [${first}..${last}] failed (exit ${enc.status}):\n${enc.stderr?.toString().slice(-2000)}`);
        rmSync(segFrames, { recursive: true, force: true });
      }
      segVideos.push(segVideo);
      // Report progress against the RE-RENDERED frame count, not the whole timeline —
      // a splice that re-renders 637 of 1530 shows `rendering 637/637`, not a misleading
      // `1530/1530` that reads like a full render (kept segments are copied, not rendered).
      if (seg.kind === 'render' && renderFrames > 0) {
        rendered += seg.end - seg.start + 1;
        opts.onProgress?.(rendered, renderFrames);
      }
    }

    // 3) Concat-copy the FFV1 clips → the new retained intermediate (byte-faithful, no re-encode).
    const listFile = join(work, 'concat.txt');
    writeFileSync(listFile, segVideos.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
    const newIntermediate = join(work, 'intermediate.mkv');
    const concat = spawnSync('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', newIntermediate,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    if (concat.status !== 0) throw new ShardError(`incremental concat failed (exit ${concat.status}):\n${concat.stderr?.toString().slice(-2000)}`);

    // 4) Single final encode of the spliced intermediate (+ the freshly mixed audio).
    const { audioInputs, audioArgs } = await planFinalAudio(opts, [...compiled.audio], duration, container);
    const finalArgs = [
      '-y', '-i', newIntermediate,
      ...audioInputs,
      ...audioArgs,
      '-c:v', finalEnc.name,
      ...videoQualityArgs(finalEnc.name, tier),
      ...(container === 'webm' ? [] : ['-pix_fmt', 'yuv420p', '-movflags', '+faststart']),
      '-t', String(duration),
      outAbs,
    ];
    const fin = spawnSync('ffmpeg', finalArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
    if (fin.status !== 0) throw new ShardError(`incremental final encode failed (exit ${fin.status}):\n${fin.stderr?.toString().slice(-2000)}`);

    // 5) Retain the new intermediate beside the output + record the manifest with the key vector.
    rmSync(intermediate, { force: true });
    renameSync(newIntermediate, intermediate);
    const manifest: RenderManifest = {
      v: 1, frameKeyDigest: newDigest, frameKeys, container, videoCodec: finalEnc.name, videoQuality: videoQualityKey(finalEnc.name, tier), fps, firstFrame, frames: total,
    };
    writeRenderManifest(outAbs, manifest);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  // Sidecars / cues, once over the final output (mirrors the sharded path).
  if ((opts.captions ?? 'burn') !== 'off') {
    const timingPath = a.timingPathFor(opts.modulePath);
    if (timingPath) {
      const { srt, vtt } = a.writeCaptionSidecars(timingPath, outAbs);
      process.stderr.write(`captions: ${srt}, ${vtt}\n`);
    } else if (opts.captions === 'sidecar') {
      process.stderr.write('note: --captions sidecar: no narration timing manifest found; run gs narrate first\n');
    }
  }
  const cueFiles = a.writeCueSidecars(outAbs, compiled.markers, duration, opts.chapters === 'vtt', opts.chapterKinds);
  if (cueFiles.length) process.stderr.write(`cues: ${cueFiles.join(', ')}\n`);

  return { frames: total, out: outAbs };
}

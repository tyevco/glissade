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
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShaderEffect, type Scene } from '@glissade/scene';
import type { CompiledTimeline } from '@glissade/core';
import { pickEncoder } from './encoders.js';
import { planFinalAudio, type RenderOptions } from './render.js';

/** Encoders that can't place a keyframe exactly on a forced boundary → not concat-copy-safe. */
const IMPRECISE_KEYFRAME_ENCODERS = new Set(['mpeg4', 'libopenh264']);

/** Per-encoder quality flags — must match render.ts's linear path byte-for-byte. */
const VIDEO_QUALITY: Record<string, string[]> = {
  'libx264': ['-crf', '18'],
  'libvpx-vp9': ['-b:v', '0', '-crf', '32'],
  'libvpx': ['-b:v', '2M'],
  'libopenh264': ['-b:v', '4M'],
  'mpeg4': ['-q:v', '3'],
};

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

  // §3.7 guard: sharded GPU output isn't reproducible across processes.
  if (sceneHasGpuNodes(scene) && !opts.allowGpuShards) {
    throw new ShardError(
      'this scene contains a GPU/shader node, whose output is not reproducible across shard ' +
        'processes (§3.7). Re-run with --allow-gpu-shards to override, or render single-threaded ' +
        '(drop --workers).',
    );
  }

  const ranges = splitFrameRange(firstFrame, lastFrame, a.workers);
  const total = lastFrame - firstFrame + 1;
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
            ...(VIDEO_QUALITY[finalEnc.name] ?? []),
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
        ...(VIDEO_QUALITY[videoEnc.name] ?? []),
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

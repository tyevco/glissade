/**
 * CLI video decoding (DESIGN.md §5.4): FFmpeg frame extraction, not
 * WebCodecs-in-Node. Frames are pre-extracted to a temp dir on warm() and
 * served synchronously to SkiaBackend behind the VideoFrameSource seam —
 * swappable if Node WebCodecs ever lands.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadImage, type Image } from '@napi-rs/canvas';
import { ColdAssetError, type VideoFrameSource } from '@glissade/scene';

export class VideoProbeError extends Error {
  constructor(path: string, detail: string) {
    super(`ffprobe failed for '${path}': ${detail}`);
    this.name = 'VideoProbeError';
  }
}

export interface VideoInfo {
  fps: number;
  duration: number;
  width: number;
  height: number;
}

export function probeVideo(path: string): VideoInfo {
  const res = spawnSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=r_frame_rate,width,height:format=duration',
    '-of', 'json', path,
  ]);
  if (res.status !== 0) throw new VideoProbeError(path, res.stderr?.toString() ?? 'unknown');
  const info = JSON.parse(res.stdout.toString()) as {
    streams: { r_frame_rate: string; width: number; height: number }[];
    format: { duration: string };
  };
  const stream = info.streams[0];
  if (!stream) throw new VideoProbeError(path, 'no video stream');
  const [num, den] = stream.r_frame_rate.split('/').map(Number);
  return {
    fps: num! / (den || 1),
    duration: parseFloat(info.format.duration),
    width: stream.width,
    height: stream.height,
  };
}

/**
 * v1 strategy: warm() extracts the full requested media range once at the
 * source's own fps; getFrameSync indexes the extracted sequence. Disk-bound,
 * trivially correct; the streaming-pipe variant is a later optimization.
 */
export class FfmpegVideoFrameSource implements VideoFrameSource {
  readonly fps: number;
  readonly duration: number;
  private readonly path: string;
  private framesDir: string | null = null;
  private warmedFrom = 0;
  private warmedTo = -1; // inclusive source-frame indices
  private readonly cache = new Map<number, Image>();

  constructor(path: string, info?: VideoInfo) {
    this.path = path;
    const probed = info ?? probeVideo(path);
    this.fps = probed.fps;
    this.duration = probed.duration;
  }

  private frameIndex(mediaT: number): number {
    return Math.max(0, Math.floor(mediaT * this.fps + 1e-9));
  }

  async warm(fromT: number, toT: number): Promise<void> {
    const from = this.frameIndex(Math.max(0, fromT));
    const to = Math.min(this.frameIndex(Math.min(toT, this.duration)), Math.ceil(this.duration * this.fps) - 1);
    if (this.framesDir && from >= this.warmedFrom && to <= this.warmedTo) return;
    if (this.framesDir) rmSync(this.framesDir, { recursive: true, force: true });
    this.cache.clear();
    this.framesDir = mkdtempSync(join(tmpdir(), 'glissade-vsrc-'));
    const startT = from / this.fps;
    const res = spawnSync('ffmpeg', [
      '-y',
      '-ss', String(startT),
      '-i', this.path,
      '-vf', `fps=${this.fps}`,
      '-start_number', String(from),
      '-frames:v', String(to - from + 1),
      join(this.framesDir, 'f-%06d.png'),
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    if (res.status !== 0) {
      throw new Error(`ffmpeg frame extraction failed: ${res.stderr?.toString().slice(-1000)}`);
    }
    // pre-decode now: @napi-rs/canvas only decodes via async loadImage(), and
    // getFrameSync must stay synchronous (§3.8) — warming is where awaiting lives
    for (let idx = from; idx <= to; idx++) {
      const file = join(this.framesDir, `f-${String(idx).padStart(6, '0')}.png`);
      if (!existsSync(file)) break; // ffmpeg may emit one fewer frame at the tail
      this.cache.set(idx, await loadImage(file));
    }
    this.warmedFrom = from;
    this.warmedTo = to;
  }

  getFrameSync(mediaT: number): Image {
    let idx = Math.min(this.frameIndex(mediaT), this.warmedTo);
    // serve the nearest earlier decoded frame at the tail (ffmpeg may emit one fewer)
    while (idx > this.warmedFrom && !this.cache.has(idx)) idx--;
    const hit = this.cache.get(idx);
    if (!hit) {
      throw new ColdAssetError(this.path, `frame ${idx} (mediaT=${mediaT}) outside warmed range`);
    }
    return hit;
  }

  close(): void {
    if (this.framesDir) rmSync(this.framesDir, { recursive: true, force: true });
    this.framesDir = null;
    this.cache.clear();
  }
}

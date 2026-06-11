/**
 * Browser video decoding (DESIGN.md §5.4): Mediabunny demux + WebCodecs
 * decode behind the VideoFrameSource seam. warm() decodes a window of frames
 * via CanvasSink (which drives VideoDecoder and handles keyframe seeking —
 * backward/random scrub is O(GOP), a readiness latency, never state).
 */

import { Input, ALL_FORMATS, UrlSource, BlobSource, CanvasSink } from 'mediabunny';
import { ColdAssetError, type VideoFrameSource } from '@glissade/scene';

const DEFAULT_LOOKAHEAD_FRAMES = 10; // Replit's published production figure
const MAX_CACHED_FRAMES = 64;

export class MediabunnyVideoFrameSource implements VideoFrameSource {
  readonly fps: number;
  readonly duration: number;
  private readonly sink: CanvasSink;
  private readonly cache = new Map<number, HTMLCanvasElement | OffscreenCanvas>();
  private readonly label: string;

  private constructor(sink: CanvasSink, fps: number, duration: number, label: string) {
    this.sink = sink;
    this.fps = fps;
    this.duration = duration;
    this.label = label;
  }

  static async open(src: string | Blob, label = typeof src === 'string' ? src : 'blob'): Promise<MediabunnyVideoFrameSource> {
    const input = new Input({
      formats: ALL_FORMATS,
      source: typeof src === 'string' ? new UrlSource(src) : new BlobSource(src),
    });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(`no video track in ${label}`);
    if (!(await track.canDecode())) throw new Error(`browser cannot decode the video codec of ${label}`);
    const stats = await track.computePacketStats(120);
    const duration = await track.computeDuration();
    const sink = new CanvasSink(track, { poolSize: 0 }); // pool off: we cache frames ourselves
    return new MediabunnyVideoFrameSource(sink, stats.averagePacketRate, duration, label);
  }

  private frameIndex(mediaT: number): number {
    return Math.max(0, Math.floor(mediaT * this.fps + 1e-9));
  }

  async warm(fromT: number, toT: number): Promise<void> {
    const from = Math.max(0, fromT);
    const to = Math.min(toT + DEFAULT_LOOKAHEAD_FRAMES / this.fps, this.duration);
    const fromIdx = this.frameIndex(from);
    const toIdx = this.frameIndex(to);
    let missing = false;
    for (let i = fromIdx; i <= toIdx; i++) {
      if (!this.cache.has(i)) {
        missing = true;
        break;
      }
    }
    if (!missing) return;
    for await (const wrapped of this.sink.canvases(from, to)) {
      if (!wrapped) continue;
      this.cache.set(this.frameIndex(wrapped.timestamp), wrapped.canvas);
    }
    // bounded memory: evict frames farthest from the warmed window
    if (this.cache.size > MAX_CACHED_FRAMES) {
      const center = (fromIdx + toIdx) / 2;
      const byDistance = [...this.cache.keys()].sort(
        (a, b) => Math.abs(b - center) - Math.abs(a - center),
      );
      for (const idx of byDistance.slice(0, this.cache.size - MAX_CACHED_FRAMES)) {
        this.cache.delete(idx);
      }
    }
  }

  getFrameSync(mediaT: number): HTMLCanvasElement | OffscreenCanvas {
    let idx = this.frameIndex(Math.min(mediaT, this.duration));
    // tolerate a missing final partial frame at the source tail
    const lastIdx = this.frameIndex(this.duration);
    while (idx > 0 && !this.cache.has(idx) && idx >= lastIdx - 2) idx--;
    const hit = this.cache.get(idx);
    if (!hit) throw new ColdAssetError(this.label, `frame ${idx} not decoded`, mediaT);
    return hit;
  }

  close(): void {
    this.cache.clear();
  }
}

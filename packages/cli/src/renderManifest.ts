/**
 * Render manifest (0.27): the byte-identical-video proof that powers the
 * audio-only REMUX fast path. When `gs render --cache` finishes a video, it
 * writes `<out>.gsrender.json` recording the ORDERED digest of every frame's
 * content-cache key plus the video-encode parameters. On a re-render, a cheap
 * key-only pre-pass (evaluate + frameCacheKey, NO raster) recomputes that digest;
 * if it matches — the visual inputs are byte-identical, so the encoded video
 * would be too — and the prior output still exists with the same encode params,
 * we skip re-encoding entirely and `ffmpeg -c:v copy` the existing video stream
 * with the new audio. An audio-only re-master becomes a remux in seconds.
 *
 * The digest IS a determinism proof: identical DisplayList per frame (the same
 * thing the frame cache and the golden corpus hash) ⇒ identical raster on the
 * pinned Skia toolchain ⇒ identical encode. Any pixel change flips the digest and
 * falls back to a full encode — the cache-hit ≡ cold-render invariant, one level up.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface RenderManifest {
  /** manifest format version */
  v: 1;
  /** sha256 over the ordered per-frame content-cache keys — the video proof */
  frameKeyDigest: string;
  /** 'mp4' | 'webm' — a container change must force a re-encode */
  container: string;
  /** the video encoder name (e.g. 'libx264') — a codec change forces a re-encode */
  videoCodec: string;
  fps: number;
  firstFrame: number;
  frames: number;
}

/** sha256 of the ordered frame keys (NUL-separated so keys can't run together). */
export function frameKeyDigest(keys: readonly string[]): string {
  const h = createHash('sha256');
  for (const k of keys) {
    h.update(k);
    h.update('\0');
  }
  return h.digest('hex');
}

const manifestPathFor = (videoPath: string): string => `${videoPath}.gsrender.json`;

/** Read the manifest beside a video output, or undefined if absent/unreadable/old-format. */
export function readRenderManifest(videoPath: string): RenderManifest | undefined {
  const p = manifestPathFor(videoPath);
  if (!existsSync(p)) return undefined;
  try {
    const m = JSON.parse(readFileSync(p, 'utf8')) as RenderManifest;
    return m && m.v === 1 && typeof m.frameKeyDigest === 'string' ? m : undefined;
  } catch {
    return undefined;
  }
}

export function writeRenderManifest(videoPath: string, m: RenderManifest): void {
  writeFileSync(manifestPathFor(videoPath), JSON.stringify(m));
}

/**
 * Decide whether a re-render can take the remux fast path: the prior manifest's
 * frame-key digest matches this render's, the prior output still exists, and the
 * encode parameters are unchanged. Pure — the caller supplies the freshly computed
 * digest + params and whether the output file exists.
 */
export function canRemux(
  prev: RenderManifest | undefined,
  now: { frameKeyDigest: string; container: string; videoCodec: string; fps: number; firstFrame: number; frames: number },
  outputExists: boolean,
): boolean {
  return (
    prev !== undefined &&
    outputExists &&
    prev.frameKeyDigest === now.frameKeyDigest &&
    prev.container === now.container &&
    prev.videoCodec === now.videoCodec &&
    prev.fps === now.fps &&
    prev.firstFrame === now.firstFrame &&
    prev.frames === now.frames
  );
}

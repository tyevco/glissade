/**
 * Asset contracts (DESIGN.md §3.8): evaluate() never awaits — callers warm
 * sources first (§2.5 readiness precondition), then emission is pure. The
 * VideoFrameSource seam isolates decoder differences (WebCodecs vs FFmpeg);
 * backends resolve asset ids to their own bitmap types.
 */

export interface VideoFrameSource {
  /** Source duration in seconds. */
  readonly duration: number;
  /** Frames per second of the source grid (mediaT quantization). */
  readonly fps: number;
  /**
   * Ensure getFrameSync can serve [fromT, toT] (seconds, media time).
   * O(GOP) for backward/random seeks; a readiness latency, never state.
   */
  warm(fromT: number, toT: number): Promise<void>;
  /**
   * The decoded frame for the source-grid frame containing mediaT.
   * Precondition: warmed. The return is backend-consumable (VideoFrame,
   * ImageBitmap, HTMLCanvasElement, or a node Image) — opaque here.
   */
  getFrameSync(mediaT: number): unknown;
  close(): void;
}

/** A decoded still image — opaque to scene/core, consumed by backends. */
export type ImageHandle = unknown;

export class ColdAssetError extends Error {
  constructor(assetId: string, detail: string) {
    super(
      `asset '${assetId}' not ready: ${detail}. evaluate() never awaits — warm assets ` +
        'before evaluating (§2.5 readiness precondition)',
    );
    this.name = 'ColdAssetError';
  }
}

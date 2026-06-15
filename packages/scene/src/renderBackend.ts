/**
 * RenderBackend — the renderer extension seam (DESIGN.md §3.4). Every backend
 * consumes the identical DisplayList IR and measures text (so line-breaking
 * agrees with rasterization), and advertises its capabilities so export/degrade
 * logic negotiates instead of assuming. `readPixels` is a Promise on every
 * backend — headless Skia resolves synchronously, the browser may await a GPU
 * readback — so callers `await` uniformly across the seam.
 */

import type { VideoFrameSource } from './assets.js';
import type { DisplayList, FilterSpec } from './displayList.js';
import type { TextMeasurer } from './text.js';

/** A filter kind the document layer can emit (mirrors `FilterSpec['kind']`). */
export type FilterKind = FilterSpec['kind'];

/** Every filter kind the shared Raster2D interpreter rasterizes (§3.4). */
export const ALL_FILTER_KINDS: ReadonlySet<FilterKind> = new Set<FilterKind>([
  'blur',
  'drop-shadow',
  'brightness',
  'contrast',
  'saturate',
]);

/** What a backend can do — queried, never assumed (§3.4 capability negotiation). */
export interface BackendCaps {
  /** Filter kinds this backend rasterizes. */
  readonly filters: ReadonlySet<FilterKind>;
  /** Can it run a ShaderEffect pass (WebGPU)? Headless Skia: false. */
  readonly shaders: boolean;
  /** Largest texture/canvas dimension it will allocate. */
  readonly maxTextureSize: number;
}

export interface RenderBackend extends TextMeasurer {
  readonly caps: BackendCaps;
  render(list: DisplayList): void;
  readPixels(): Promise<Uint8ClampedArray>;
  /**
   * Browser zero-copy encode path (§3.4): a decoded frame for VideoEncoder.
   * Absent on headless backends. Typed `unknown` because `VideoFrame` is a DOM
   * type and `@glissade/scene` carries no DOM lib — browser backends cast.
   */
  toVideoFrame?(timestampUs: number): unknown;
  setImageAsset(assetId: string, image: unknown): void;
  setVideoAsset(assetId: string, source: VideoFrameSource): void;
  dispose(): void;
}

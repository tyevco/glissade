/**
 * @glissade/backend-skia — headless DisplayList rasterizer over @napi-rs/canvas
 * (DESIGN.md §3.4). The per-path-deterministic twin of backend-canvas2d, now
 * sharing the ONE Raster2D interpreter in @glissade/scene — the twins
 * structurally cannot drift. This file owns only the @napi-rs canvas flavor
 * plus headless concerns (PNG encode, sync readPixels, text measurement).
 */

import { createCanvas, GlobalFonts, Path2D, type Canvas, type Image } from '@napi-rs/canvas';
import {
  ALL_FILTER_KINDS,
  Raster2D,
  fontString,
  type BackendCaps,
  type Ctx2DLike,
  type DisplayList,
  type FontSpec,
  type RenderBackend,
  type TextMeasurer,
  type TextMetricsLite,
  type VideoFrameSource,
} from '@glissade/scene';

/** Largest dimension @napi-rs/canvas will allocate (Skia's default surface cap). */
const MAX_TEXTURE = 16384;

type Drawable = Canvas | Image;

export type { TextMetricsLite } from '@glissade/scene';

/**
 * Factory-time measurement (§3.6): component factories run before any scene
 * exists, so give the process a real measurer up front —
 *   setDefaultMeasurer(createMeasurer({ fonts: { 'DejaVu Sans': fontPath } }))
 * Text pulls (measuredSize/lineBoxes/wordBoxes) and un-injected scenes then
 * measure with the SAME rasterizer metrics gs render and the golden harness
 * use; scene-injected measurers still win. The backing canvas is lazy.
 */
export function createMeasurer(opts: { fonts?: Record<string, string> } = {}): TextMeasurer {
  for (const [family, path] of Object.entries(opts.fonts ?? {})) {
    GlobalFonts.registerFromPath(path, family);
  }
  let backend: SkiaBackend | null = null;
  return {
    measureText: (text, font) => (backend ??= new SkiaBackend(8, 8)).measureText(text, font),
  };
}

export class SkiaBackend implements RenderBackend {
  private readonly canvas: Canvas;
  private readonly raster: Raster2D<Canvas, Path2D, Drawable>;

  /** Headless CPU Skia: all document filters, no GPU shader pass (§3.4/§3.7). */
  readonly caps: BackendCaps = { filters: ALL_FILTER_KINDS, shaders: false, maxTextureSize: MAX_TEXTURE };

  constructor(width: number, height: number) {
    this.canvas = createCanvas(width, height);
    this.raster = new Raster2D<Canvas, Path2D, Drawable>({
      // one structural cast at the seam: SKRSContext2D satisfies Ctx2DLike
      // (fillStyle/getTransform widen to unknown); behavior is golden-tested
      context: (c) => c.getContext('2d') as unknown as Ctx2DLike<Path2D, Drawable>,
      createCanvas: (w, h) => createCanvas(w, h),
      newPath: () => new Path2D(),
    });
  }

  setImageAsset(assetId: string, image: Drawable): void {
    this.raster.setImageAsset(assetId, image);
  }

  setVideoAsset(assetId: string, source: VideoFrameSource): void {
    this.raster.setVideoAsset(assetId, source);
  }

  measureText(text: string, font: FontSpec): TextMetricsLite {
    const ctx = this.canvas.getContext('2d');
    ctx.save();
    ctx.font = fontString(font);
    const m = ctx.measureText(text);
    ctx.restore();
    return { width: m.width, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
  }

  render(list: DisplayList): void {
    this.raster.render(this.canvas, list);
  }

  /** Raw RGBA — the FFmpeg pipe path (§5.1d). Resolves synchronously (no GPU readback) but typed Promise to match the RenderBackend contract. */
  readPixels(): Promise<Uint8ClampedArray> {
    const ctx = this.canvas.getContext('2d');
    return Promise.resolve(ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data);
  }

  /** Deterministic PNG bytes for golden frames and `gs render` output. */
  encodePng(): Buffer {
    return this.canvas.toBuffer('image/png');
  }

  dispose(): void {
    this.raster.dispose();
  }
}

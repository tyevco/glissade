/**
 * @glissade/backend-canvas2d — rasterize DisplayLists onto Canvas 2D
 * (DESIGN.md §3.4–§3.5). A thin adapter over the shared Raster2D interpreter
 * in @glissade/scene: this file owns only the DOM canvas flavor (context
 * acquisition, OffscreenCanvas layers, Path2D) and text measurement.
 */

import {
  Raster2D,
  fontString,
  type Ctx2DLike,
  type DisplayList,
  type DrawCommand,
  type FontSpec,
  type TextMetricsLite,
  type VideoFrameSource,
} from '@glissade/scene';

type Drawable = Exclude<CanvasImageSource, SVGImageElement>;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export type { TextMetricsLite } from '@glissade/scene';

export class Canvas2DBackend {
  private readonly target: AnyCanvas;
  private readonly raster: Raster2D<AnyCanvas, Path2D, Drawable>;

  constructor(target: AnyCanvas) {
    this.target = target;
    this.raster = new Raster2D<AnyCanvas, Path2D, Drawable>({
      // one structural cast at the seam: the DOM context satisfies Ctx2DLike
      // (fillStyle/getTransform widen to unknown); behavior is golden/SSIM-tested
      context: (c) => this.context(c) as unknown as Ctx2DLike<Path2D, Drawable>,
      createCanvas: (w, h) => new OffscreenCanvas(w, h),
      newPath: () => new Path2D(),
    });
  }

  /** Register a decoded still (kind 'image' assets). */
  setImageAsset(assetId: string, image: Drawable): void {
    this.raster.setImageAsset(assetId, image);
  }

  /** Register a warmed-on-demand video source (kind 'video' assets, §3.8). */
  setVideoAsset(assetId: string, source: VideoFrameSource): void {
    this.raster.setVideoAsset(assetId, source);
  }

  measureText(text: string, font: FontSpec): TextMetricsLite {
    const ctx = this.context(this.target);
    ctx.save();
    ctx.font = fontString(font);
    const m = ctx.measureText(text);
    ctx.restore();
    return {
      width: m.width,
      ascent: m.actualBoundingBoxAscent,
      descent: m.actualBoundingBoxDescent,
    };
  }

  render(list: DisplayList): void {
    this.raster.render(this.target, list);
  }

  async readPixels(): Promise<Uint8ClampedArray> {
    const ctx = this.context(this.target);
    return ctx.getImageData(0, 0, this.target.width, this.target.height).data;
  }

  dispose(): void {
    this.raster.dispose();
  }

  private context(canvas: AnyCanvas): Ctx2D {
    const ctx = canvas.getContext('2d') as Ctx2D | null;
    if (!ctx) throw new Error('canvas 2d context unavailable');
    return ctx;
  }
}

export type { DrawCommand, DisplayList };

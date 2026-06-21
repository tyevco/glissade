/**
 * @glissade/backend-canvas2d — rasterize DisplayLists onto Canvas 2D
 * (DESIGN.md §3.4–§3.5). A thin adapter over the shared Raster2D interpreter
 * in @glissade/scene: this file owns only the DOM canvas flavor (context
 * acquisition, OffscreenCanvas layers, Path2D) and text measurement.
 */

import {
  ALL_FILTER_KINDS,
  Raster2D,
  fontString,
  type BackendCaps,
  type Ctx2DLike,
  type DisplayList,
  type DrawCommand,
  type FontSpec,
  type RenderBackend,
  type ShaderCaps,
  type ShaderRef,
  type TextMetricsLite,
  type VideoFrameSource,
} from '@glissade/scene';

/**
 * §3.7 shader runner seam: @glissade/effects-webgpu registers here at load
 * time (the loadYogaLayoutEngine pattern). This package never imports GPU
 * code — headless paths stay clean by construction.
 */
export interface ShaderRunner {
  apply(layer: AnyCanvas, shader: ShaderRef, w: number, h: number): Drawable | null;
}

let shaderRunner: ShaderRunner | null = null;

export function setShaderRunner(runner: ShaderRunner | null): void {
  shaderRunner = runner;
}

type Drawable = Exclude<CanvasImageSource, SVGImageElement>;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * Allocate an offscreen layer (hit only by group opacity<1 / blend / filter /
 * mesh). Prefer `OffscreenCanvas`, but fall back to a detached `<canvas>` where
 * it's unavailable — so the single-file `@glissade/browser` bundle survives
 * environments without `OffscreenCanvas`. Inert where `OffscreenCanvas` exists
 * (every test + the Skia twin, which never reaches this), so it moves no golden.
 */
function createLayerCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export type { TextMetricsLite } from '@glissade/scene';

/** Largest canvas dimension browsers reliably allocate. */
const MAX_TEXTURE = 16384;

export class Canvas2DBackend implements RenderBackend {
  private readonly target: AnyCanvas;
  private readonly raster: Raster2D<AnyCanvas, Path2D, Drawable>;

  /** All document filters; shaders only when an effects-webgpu runner is registered (§3.7). */
  get caps(): BackendCaps {
    return { filters: ALL_FILTER_KINDS, shaders: shaderRunner !== null, maxTextureSize: MAX_TEXTURE };
  }

  constructor(target: AnyCanvas, opts: { shaderCaps?: ShaderCaps } = {}) {
    this.target = target;
    this.raster = new Raster2D<AnyCanvas, Path2D, Drawable>(
      {
        // one structural cast at the seam: the DOM context satisfies Ctx2DLike
        // (fillStyle/getTransform widen to unknown); behavior is golden/SSIM-tested
        context: (c) => this.context(c) as unknown as Ctx2DLike<Path2D, Drawable>,
        createCanvas: (w, h) => createLayerCanvas(w, h),
        newPath: () => new Path2D(),
        applyShader: (layer, shader, w, h) => shaderRunner?.apply(layer, shader, w, h) ?? null,
      },
      opts.shaderCaps ?? 'warn',
    );
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

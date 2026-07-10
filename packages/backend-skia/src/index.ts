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
  assertFiniteFontSize,
  fontString,
  type BackendCaps,
  type Ctx2DLike,
  type DisplayList,
  type LayerStore,
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

// Perceptual golden tier (0.37) — SSIM scalar + per-tile map + heat-map, shared
// by the PARITY suite and `gs repin`. The headless twin's metric, never on the embed path.
export { ssim, ssimMap, heatmapRgba, type SsimMap } from './perceptual.js';

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
  /**
   * OUTPUT raster scale for the `gs render --preview-res` two-tier draft (0.75).
   * `undefined` = the DEFAULT full-res path: `render()` takes the EXACT current
   * code path (no identity multiply, byte-for-byte the pre-0.75 goldens). When
   * set, `render()` rasterizes the already-composited DisplayList into the SMALLER
   * `width×height` canvas under an EFFECTIVE scale `sx=width/srcWidth`,
   * `sy=height/srcHeight` — so the scaled canvas is exactly FILLED (no edge gap
   * from the canonical `round()` dim). This is the OUTPUT-raster layer, ORTHOGONAL
   * to and applied ON TOP OF any scene `.scale` transform already baked into the
   * DisplayList (scene transform first, then output raster scale).
   */
  private readonly outputScale: { sx: number; sy: number } | undefined;

  /** Headless CPU Skia: all document filters, no GPU shader pass (§3.4/§3.7). */
  readonly caps: BackendCaps = { filters: ALL_FILTER_KINDS, shaders: false, maxTextureSize: MAX_TEXTURE };

  constructor(
    width: number,
    height: number,
    opts: {
      layerStore?: LayerStore;
      /**
       * §0.75 `gs render --preview-res`: render the composited DisplayList into
       * this (already-scaled) `width×height` canvas at the EFFECTIVE output scale
       * `width/srcWidth × height/srcHeight` — the canonical `srcWidth/srcHeight`
       * are the scene's UNSCALED dims. Opt-in: omit it for the byte-identical
       * full-res path. Only pass it for a real f<1 preview draft.
       */
      outputScale?: { srcWidth: number; srcHeight: number };
    } = {},
  ) {
    this.canvas = createCanvas(width, height);
    this.outputScale =
      opts.outputScale !== undefined
        ? { sx: width / opts.outputScale.srcWidth, sy: height / opts.outputScale.srcHeight }
        : undefined;
    this.raster = new Raster2D<Canvas, Path2D, Drawable>(
      {
        // one structural cast at the seam: SKRSContext2D satisfies Ctx2DLike
        // (fillStyle/getTransform widen to unknown); behavior is golden-tested
        context: (c) => c.getContext('2d') as unknown as Ctx2DLike<Path2D, Drawable>,
        createCanvas: (w, h) => createCanvas(w, h),
        newPath: () => new Path2D(),
      },
      'warn',
      undefined, // cacheEnabled → its env-driven default
      opts.layerStore, // §3.5 disk layer-cache tier (undefined = in-memory only)
    );
  }

  /** Attach the §3.5 disk layer-cache store (the CLI wires this once caps are known). */
  setLayerStore(store: LayerStore | undefined): void {
    this.raster.setLayerStore(store);
  }

  setImageAsset(assetId: string, image: Drawable): void {
    this.raster.setImageAsset(assetId, image);
  }

  setVideoAsset(assetId: string, source: VideoFrameSource): void {
    this.raster.setVideoAsset(assetId, source);
  }

  measureText(text: string, font: FontSpec): TextMetricsLite {
    assertFiniteFontSize(font, 'SkiaBackend.measureText'); // contract: finite positive size (§0.24)
    const ctx = this.canvas.getContext('2d');
    ctx.save();
    ctx.font = fontString(font);
    // STATIC variable-font passthrough (§3.6): measure with the same axes the
    // draw applies, so a heavier `wght` widens line-breaking/box metrics to
    // match. save()/restore() scopes it; @napi-rs/canvas exposes the property.
    if (font.fontVariationSettings !== undefined) {
      (ctx as unknown as { fontVariationSettings: string }).fontVariationSettings = font.fontVariationSettings;
    }
    // Letter-spacing folds into measureText so wrapping matches the painted
    // tracking; save()/restore() scopes it. @napi-rs/canvas honors it.
    if (font.letterSpacing !== undefined) {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${font.letterSpacing}px`;
    }
    const m = ctx.measureText(text);
    ctx.restore();
    return { width: m.width, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
  }

  render(list: DisplayList): void {
    if (this.outputScale === undefined) {
      // DEFAULT full-res path — the EXACT current code path (NO identity multiply,
      // no extra transform command): byte-for-byte identical to pre-0.75.
      this.raster.render(this.canvas, list);
      return;
    }
    // §0.75 --preview-res scaled draft: rasterize the ALREADY-COMPOSITED DisplayList
    // into the scaled canvas under an OUTPUT raster scale. We prepend ONE `transform`
    // command (== ctx.scale(sx,sy)) and stamp the DisplayList `size` to the scaled
    // canvas dims (raster2d sizes the target + all group layers from `list.size`, so
    // the whole composite runs at the SMALLER device resolution = the raster-time
    // win). The scene's own `.scale` transforms live INSIDE `list.commands`, so they
    // compose UNDER this output scale — orthogonal layers, never double-applied.
    const { sx, sy } = this.outputScale;
    const scaled: DisplayList = {
      ...list,
      size: { w: this.canvas.width, h: this.canvas.height },
      commands: [{ op: 'transform', m: [sx, 0, 0, sy, 0, 0] }, ...list.commands],
    };
    this.raster.render(this.canvas, scaled);
  }

  /** Raw RGBA — the FFmpeg pipe path (§5.1d). Resolves synchronously (no GPU readback) but typed Promise to match the RenderBackend contract. */
  readPixels(): Promise<Uint8ClampedArray> {
    const ctx = this.canvas.getContext('2d');
    return Promise.resolve(ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data);
  }

  /**
   * §3.5 disk-cache HIT path: blit stored straight-RGBA into the canvas so the
   * IDENTICAL `encodePng()` / `readPixels()` downstream runs over it. A
   * `render(dl)→encodePng()` and a `putPixels(readPixels(dl))→encodePng()` are
   * byte-identical (the putImageData round-trip preserves bytes), which is what
   * makes a frame-cache hit byte-equal to a cold render. The buffer length must
   * be `width*height*4`.
   */
  putPixels(rgba: Uint8ClampedArray): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (rgba.length !== w * h * 4) {
      throw new Error(`putPixels: expected ${w * h * 4} RGBA bytes for ${w}x${h}, got ${rgba.length}`);
    }
    const ctx = this.canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
  }

  /** Deterministic PNG bytes for golden frames and `gs render` output. */
  encodePng(): Buffer {
    return this.canvas.toBuffer('image/png');
  }

  dispose(): void {
    this.raster.dispose();
  }
}

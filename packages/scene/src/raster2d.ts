/**
 * The shared DisplayList interpreter (§3.4): one command walk over the
 * canvas-2d-shaped API, generic over the host's canvas/path/drawable types.
 * backend-canvas2d (DOM) and backend-skia (@napi-rs) instantiate it with
 * four-line adapters, so the twin rasterizers structurally cannot drift —
 * the golden + SSIM suites verify the refactor preserved every byte.
 */

import { emitDevWarning, type MeshPaint } from '@glissade/core';
import { ColdAssetError } from './assets.js';
import type { VideoFrameSource } from './assets.js';
import {
  filtersToCanvasFilter,
  type DisplayList,
  type FilterSpec,
  type FontSpec,
  type Paint,
  type PathSeg,
  type Resource,
  type ShaderRef,
} from './displayList.js';
import { IDENTITY, multiply, type Mat2x3 } from './matrix.js';
import { densifyStops } from './gradient.js';
import { meshRasterSize, rasterizeMesh } from './meshGradient.js';

/** Stroke/text mesh paint has no clippable fill region — pick a deterministic
 * representative solid (bg, else the first point) so it renders without a crash. */
let warnedMeshStroke = false;
function meshRepresentativeColor(paint: MeshPaint): string {
  if (!warnedMeshStroke) {
    warnedMeshStroke = true;
    emitDevWarning(
      'mesh Paint on a stroke/text resolves to a representative solid color (mesh fill is ' +
        'supported only on filled paths, §3 Paint) — use a fillPath for the mesh gradient',
    );
  }
  return paint.bg ?? paint.points[0]?.color ?? '#00000000';
}
export { type TextMetricsLite } from './text.js';

/** A backend gradient handle (DOM CanvasGradient and @napi-rs CanvasGradient both satisfy it). */
export interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void;
}

/** The structural path surface buildPath drives — DOM Path2D and @napi-rs Path2D both satisfy it. */
export interface PathLike {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  ellipse(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number): void;
  closePath(): void;
}

/** The exact 2D-context surface the interpreter uses — nothing more. */
export interface Ctx2DLike<TPath, TDrawable> {
  save(): void;
  restore(): void;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  resetTransform(): void;
  getTransform(): unknown;
  setTransform(m: unknown): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  clip(path: TPath, rule: 'nonzero' | 'evenodd'): void;
  fill(path: TPath): void;
  stroke(path: TPath): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: TDrawable, x: number, y: number, w?: number, h?: number): void;
  drawImage(
    image: TDrawable,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void;
  setLineDash(segments: number[]): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradientLike;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradientLike;
  lineDashOffset: number;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  /**
   * Variable-font axes (CSS `font-variation-settings` form). PRESENT on
   * `@napi-rs/canvas` (a settable context property — the Skia/export path
   * renders the axes) and ABSENT on the browser DOM 2D context (the optional
   * `?` makes it a guarded no-op there, never a throw). The `fillText` case
   * writes it only when a FontSpec carries axes, then resets to `'normal'`, so
   * default Text never touches it (byte-identical FontSpec / pixels).
   */
  fontVariationSettings?: string;
  textBaseline: string;
  textAlign: string;
  globalAlpha: number;
  globalCompositeOperation: string;
  filter: string;
  imageSmoothingEnabled: boolean;
  /** §3 mesh Paint: write a straight-RGBA buffer into an offscreen tile, then
   * blit it (clip + drawImage). Both DOM and @napi-rs/canvas expose these. */
  createImageData(w: number, h: number): ImageDataLike;
  putImageData(data: ImageDataLike, x: number, y: number): void;
  /** Read straight-RGBA back out — used to persist a cached layer's raster to
   * the disk layer store (§3.5 tier). Both DOM and @napi-rs/canvas expose it. */
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageDataLike;
}

/** The structural ImageData surface the mesh blit drives — DOM ImageData and
 * @napi-rs/canvas ImageData both satisfy it (writable `.data`). */
export interface ImageDataLike {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface CanvasLike {
  width: number;
  height: number;
}

/** Local-space bounds of the path being filled, for gradient defaults. */
interface FillBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Resolve a Paint to a canvas fillStyle/strokeStyle value — a CSS string for
 * `color`, a backend gradient for `radial`. The gradient is built in the
 * CURRENT (local) transform, so it translates/scales with the shape. When
 * `center`/`radius` are omitted, default to the filled path's bounds (center =
 * bounds center, radius = half the diagonal so the edge reaches the corners).
 * Pure function of (paint, bounds): the same inputs raster byte-identically.
 */
interface GradientCtx {
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradientLike;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradientLike;
}
function resolveFill(ctx: GradientCtx, paint: Paint, bounds: FillBounds | null): string | CanvasGradientLike {
  if (paint.kind === 'color') return paint.color;
  // mesh has no fillStyle representation — the fillPath path blits it (clip +
  // drawImage). A mesh reaching here is a STROKE/TEXT mesh paint (no clippable
  // fill region): degrade to a deterministic representative solid (bg, else the
  // first point's color) with a one-time dev warning, never a crash.
  if (paint.kind === 'mesh') return meshRepresentativeColor(paint);
  let g: CanvasGradientLike;
  if (paint.kind === 'radial') {
    const cx = paint.center ? paint.center[0] : bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
    const cy = paint.center ? paint.center[1] : bounds ? (bounds.minY + bounds.maxY) / 2 : 0;
    const r = paint.radius !== undefined ? paint.radius : bounds ? Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 : 0;
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  } else {
    // linear: from/to default to a vertical sweep across the bounds (top → bottom)
    const fx = paint.from ? paint.from[0] : bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
    const fy = paint.from ? paint.from[1] : bounds ? bounds.minY : 0;
    const tx = paint.to ? paint.to[0] : bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
    const ty = paint.to ? paint.to[1] : bounds ? bounds.maxY : 0;
    g = ctx.createLinearGradient(fx, fy, tx, ty);
  }
  // smooth/gaussian: densify + oklab-ease the stops so the ramp melts like a
  // wide blur (no Mach-banding); 'linear' (default) keeps the authored stops
  const stops = paint.interpolation ? densifyStops(paint.stops, paint.interpolation) : paint.stops;
  for (const s of stops) g.addColorStop(s.offset, s.color);
  return g;
}

/** What a backend supplies: constructors and context access for its canvas flavor. */
export interface Raster2DHost<TCanvas extends CanvasLike, TPath extends PathLike, TDrawable> {
  context(canvas: TCanvas): Ctx2DLike<TPath, TDrawable>;
  createCanvas(w: number, h: number): TCanvas;
  newPath(): TPath;
  /**
   * §3.7 shader pass: run the WGSL effect over the group layer and return a
   * drawable replacement, or null when unavailable. Absent/null → the layer
   * composites unfiltered per caps.shaders (warn by default, error opt-in).
   * Only browser hosts wire this (via @glissade/effects-webgpu); headless
   * backends stay GPU-free by construction.
   */
  applyShader?(layer: TCanvas, shader: ShaderRef, w: number, h: number): TDrawable | null;
}

export type ShaderCaps = 'warn' | 'error';

export function fontString(font: FontSpec): string {
  const style = font.style === 'italic' ? 'italic ' : '';
  const weight = font.weight !== undefined && font.weight !== 400 ? `${font.weight} ` : '';
  return `${style}${weight}${font.size}px ${font.family}`;
}

interface Layer<TPath extends PathLike, TDrawable, TCanvas extends CanvasLike> {
  ctx: Ctx2DLike<TPath, TDrawable>;
  canvas: TCanvas | null; // null for the base layer
  opacity: number;
  blend: string;
  filter?: string; // compiled canvas filter for the composite draw (§3.4)
  filters?: FilterSpec[]; // the specs behind `filter`, for outset computation
  shader?: ShaderRef; // §3.7 effect pass, applied before the composite
  matte?: 'alpha' | 'luma'; // 0.34: composite this layer as a matte (destination-in)
  /** device-space box of everything painted into this layer; null = nothing yet */
  bounds: Bounds | null;
  /** true once content can't be conservatively boxed → never clip, parent inherits */
  unbounded: boolean;
  /** §3.5: full LRU key (cacheKey @ device transform) to STORE this layer under on popGroup; undefined = don't cache. */
  cacheStoreKey?: string;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * §3.5 DISK layer-cache tier. The in-memory raster LRU below spans one render;
 * an injected `LayerStore` persists a cached layer's DEVICE-space RGBA across
 * renders (and re-narrations), so an expensive static subtree — a blurred mesh
 * backdrop — rasterizes ONCE and re-blits on later runs even when the whole-frame
 * cache is defeated by a caption/timing change. The store is injected (scene stays
 * Node-dep-free); the CLI provides an fs-backed impl that salts the key with the
 * toolchain version + backend caps + frame size. A restored RGBA composites
 * byte-identically to a fresh raster (getImageData → store → putImageData
 * round-trips exactly — the same guarantee the frame cache relies on).
 */
export interface LayerCacheEntry {
  /** straight-RGBA of the full w×h device-space layer canvas */
  readonly rgba: Uint8ClampedArray;
  readonly w: number;
  readonly h: number;
  /** device-space painted bounds (or null); rides along — the hit can't recompute it */
  readonly bounds: Bounds | null;
  readonly unbounded: boolean;
}

export interface LayerStore {
  /** key = `<sub-DisplayList fnv1a>@<deviceTransformKey>` (the store salts version/caps/size). */
  get(key: string): LayerCacheEntry | undefined;
  put(key: string, entry: LayerCacheEntry): void;
}

/**
 * §3.5 cross-frame raster cache entry: a rasterized group layer plus the exact
 * bounds/unbounded state the composite (incl. the clippable fast path) needs —
 * those can't be recomputed when the slice is fast-forwarded on a HIT, so they
 * ride with the bitmap. The canvas is DEVICE-space (parent CTM baked in), which
 * is why the LRU key folds in the inherited transform: a HIT blits at identity.
 */
interface CacheEntry<TCanvas extends CanvasLike> {
  canvas: TCanvas;
  bounds: Bounds | null;
  unbounded: boolean;
}

/** Hardcoded LRU cap (§3.5). Evicted canvases return to the raster pool. */
const RASTER_CACHE_CAP = 16;

/**
 * Round a device-transform component into the cache key. The layer bakes the
 * parent CTM into its pixels, so two frames that share a cacheKey but differ in
 * device transform are NOT interchangeable — they must key separately. Rounding
 * to 1e-4 collapses float jitter from matrix re-multiplication of an unchanged
 * transform (so a genuinely static parent HITs) while keeping any visible move
 * to a distinct key (so a stale-CTM bitmap can never blit). The float is taken
 * verbatim into the string — no lossy truncation that could alias two CTMs.
 */
function transformKey(m: Mat2x3): string {
  // -0 → 0 (matrix.ts already normalizes, but the join is the contract surface)
  const q = (v: number) => (Object.is(v, -0) ? '0' : String(Math.round(v * 1e4) / 1e4));
  return `${q(m[0])},${q(m[1])},${q(m[2])},${q(m[3])},${q(m[4])},${q(m[5])}`;
}

/**
 * How far a filter chain can paint beyond its input (device px). Each stage
 * feeds the next, so outsets ADD. Gaussian reach: Skia truncates at 3σ and
 * the CSS blur/shadow radii are ≥ σ, so 3× the radius over-covers either
 * convention. Color-only filters map transparent → transparent: zero outset.
 */
function filterOutset(filters: FilterSpec[] | undefined): number {
  let total = 0;
  for (const f of filters ?? []) {
    if (f.kind === 'blur') total += 3 * f.radius;
    else if (f.kind === 'drop-shadow') total += Math.max(Math.abs(f.dx), Math.abs(f.dy)) + 3 * f.blur;
  }
  return total;
}

function growBounds(b: Bounds | null, x: number, y: number): Bounds {
  if (!b) return { minX: x, minY: y, maxX: x, maxY: y };
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
  return b;
}

/** Local-space rect (already outset) → device-space box under m. */
function accumulateRect(
  layer: { bounds: Bounds | null },
  m: Mat2x3,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) {
    layer.bounds = growBounds(layer.bounds, m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
  }
}

/** Control-point box of a path — curves and rotated ellipses stay inside it. */
function segsBounds(segs: PathSeg[]): Bounds | null {
  let b: Bounds | null = null;
  const pt = (x: number, y: number) => {
    b = growBounds(b, x, y);
  };
  for (const seg of segs) {
    switch (seg[0]) {
      case 'M':
      case 'L':
        pt(seg[1], seg[2]);
        break;
      case 'C':
        pt(seg[1], seg[2]);
        pt(seg[3], seg[4]);
        pt(seg[5], seg[6]);
        break;
      case 'Q':
        pt(seg[1], seg[2]);
        pt(seg[3], seg[4]);
        break;
      case 'E': {
        const r = Math.max(seg[3], seg[4]);
        pt(seg[1] - r, seg[2] - r);
        pt(seg[1] + r, seg[2] + r);
        break;
      }
    }
  }
  return b;
}

export class Raster2D<TCanvas extends CanvasLike, TPath extends PathLike, TDrawable> {
  private readonly pool: TCanvas[] = [];
  private readonly pathCache = new WeakMap<object, TPath>();
  private readonly pathBoundsCache = new WeakMap<object, Bounds | null>();
  private readonly images = new Map<string, TDrawable>();
  private readonly videos = new Map<string, VideoFrameSource>();
  private warnedShaders = false;
  private warnedFontVariation = false;
  /**
   * §3.5 bitmap LRU: device-transform-qualified cacheKey → rasterized layer.
   * A Map preserves insertion order, so the oldest key is `keys().next()` —
   * touch-on-hit by delete+set keeps it a true LRU. Disabled (stays empty) when
   * `cacheEnabled` is false, so cache-cold === cache-warm is testable directly.
   */
  private readonly rasterCache = new Map<string, CacheEntry<TCanvas>>();
  private readonly cacheEnabled: boolean;

  constructor(
    private readonly host: Raster2DHost<TCanvas, TPath, TDrawable>,
    /** caps.shaders (§3.7): what happens when a shader can't run here. */
    private readonly shaderCaps: ShaderCaps = 'warn',
    /**
     * §3.5: opt-OUT switch for the bitmap LRU. Defaults on, but the env var
     * RASTER_CACHE=0 force-disables it (the equality test renders both ways).
     * A disabled cache is byte-identical — it just always takes the miss path.
     */
    cacheEnabled: boolean = (globalThis.process?.env?.['RASTER_CACHE'] ?? '1') !== '0',
    /**
     * §3.5 disk layer-cache tier: an injected persistent store for cached-layer
     * rasters (spans renders, survives re-narration). Undefined = in-memory only.
     * Also settable post-construction (the CLI needs backend caps to salt the
     * store's key, which aren't known until the backend exists).
     */
    private layerStore: LayerStore | undefined = undefined,
  ) {
    this.cacheEnabled = cacheEnabled;
  }

  /** Attach (or clear) the §3.5 disk layer-cache store after construction. */
  setLayerStore(store: LayerStore | undefined): void {
    this.layerStore = store;
  }

  /** Register a decoded still (kind 'image' assets). */
  setImageAsset(assetId: string, image: TDrawable): void {
    this.images.set(assetId, image);
  }

  /** Register a warmed-on-demand video source (kind 'video' assets, §3.8). */
  setVideoAsset(assetId: string, source: VideoFrameSource): void {
    this.videos.set(assetId, source);
  }

  dispose(): void {
    this.pool.length = 0;
    this.rasterCache.clear();
  }

  private resolveDrawable(res: Resource, id: number): TDrawable {
    if (res.kind === 'image') {
      const img = this.images.get(res.assetId);
      if (!img) throw new ColdAssetError(res.assetId, 'no decoded image registered');
      return img;
    }
    if (res.kind === 'videoFrame') {
      const source = this.videos.get(res.assetId);
      if (!source) throw new ColdAssetError(res.assetId, 'no VideoFrameSource registered', res.mediaT);
      try {
        return source.getFrameSync(res.mediaT) as TDrawable;
      } catch (e) {
        // re-key on the asset id + requested time so callers can demand-warm
        if (e instanceof ColdAssetError) throw new ColdAssetError(res.assetId, e.detail, res.mediaT);
        throw e;
      }
    }
    throw new Error(`resource ${id} is not drawable`);
  }

  private path(resources: Resource[], id: number): TPath {
    const res = resources[id];
    if (!res || res.kind !== 'path') throw new Error(`resource ${id} is not a path`);
    let p = this.pathCache.get(res);
    if (!p) {
      p = this.buildPath(res.segs);
      this.pathCache.set(res, p);
    }
    return p;
  }

  private pathBounds(resources: Resource[], id: number): Bounds | null {
    const res = resources[id];
    if (!res || res.kind !== 'path') return null;
    if (!this.pathBoundsCache.has(res)) this.pathBoundsCache.set(res, segsBounds(res.segs));
    return this.pathBoundsCache.get(res) ?? null;
  }

  private buildPath(segs: PathSeg[]): TPath {
    const p = this.host.newPath();
    for (const seg of segs) {
      switch (seg[0]) {
        case 'M':
          p.moveTo(seg[1], seg[2]);
          break;
        case 'L':
          p.lineTo(seg[1], seg[2]);
          break;
        case 'C':
          p.bezierCurveTo(seg[1], seg[2], seg[3], seg[4], seg[5], seg[6]);
          break;
        case 'Q':
          p.quadraticCurveTo(seg[1], seg[2], seg[3], seg[4]);
          break;
        case 'E':
          p.ellipse(seg[1], seg[2], seg[3], seg[4], seg[5], seg[6], seg[7]);
          break;
        case 'Z':
          p.closePath();
          break;
      }
    }
    return p;
  }

  private acquire(w: number, h: number): TCanvas {
    const pooled = this.pool.pop();
    if (pooled) {
      if (pooled.width !== w) pooled.width = w;
      if (pooled.height !== h) pooled.height = h;
      return pooled;
    }
    return this.host.createCanvas(w, h);
  }

  private release(canvas: TCanvas): void {
    if (this.pool.length < 8) this.pool.push(canvas);
  }

  /**
   * §3.5 LRU insert with touch-on-hit + eviction-to-pool. Storing under a key
   * that already holds a (different) canvas releases the old one first.
   */
  private cacheStore(key: string, entry: CacheEntry<TCanvas>): void {
    const prior = this.rasterCache.get(key);
    if (prior) {
      this.rasterCache.delete(key);
      if (prior.canvas !== entry.canvas) this.release(prior.canvas);
    }
    this.rasterCache.set(key, entry);
    while (this.rasterCache.size > RASTER_CACHE_CAP) {
      const oldest = this.rasterCache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const evicted = this.rasterCache.get(oldest)!;
      this.rasterCache.delete(oldest);
      this.release(evicted.canvas);
    }
  }

  private cacheTouch(key: string): CacheEntry<TCanvas> | undefined {
    const hit = this.rasterCache.get(key);
    if (hit) {
      // move to MRU
      this.rasterCache.delete(key);
      this.rasterCache.set(key, hit);
    }
    return hit;
  }

  /**
   * §3 mesh Paint blit (the spike-chosen mechanism: clip + drawImage, NOT
   * createPattern — the pattern path leaks edge-AA/alpha contamination and an
   * uncontrolled resample filter across backends, breaking SSIM; clip+drawImage
   * is fully controlled and clips to the actual path, not just its bounds box).
   *
   * The mesh is rasterized by the SHARED kernel into a fixed downscaled buffer
   * (identical bytes on both backends), written into an offscreen tile, then
   * upscaled into the path-local bounds with `imageSmoothingEnabled` PINNED true.
   * The clip is the real fill path, so a circle/star fills correctly. Only this
   * final blit's AA differs per backend — the source ImageData is byte-identical,
   * which is what makes the golden byte-exact and browser↔Skia SSIM ≥ 0.97.
   */
  private fillMesh(
    ctx: Ctx2DLike<TPath, TDrawable>,
    path: TPath,
    paint: MeshPaint,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
  ): void {
    const bw = bounds.maxX - bounds.minX;
    const bh = bounds.maxY - bounds.minY;
    if (bw <= 0 || bh <= 0) return;
    const { w, h } = meshRasterSize(bw, bh);
    const buf = rasterizeMesh(paint, w, h);
    const tile = this.acquire(w, h);
    const tileCtx = this.host.context(tile);
    const img = tileCtx.createImageData(w, h);
    img.data.set(buf);
    tileCtx.putImageData(img, 0, 0);
    ctx.save();
    ctx.clip(path, 'nonzero');
    ctx.imageSmoothingEnabled = true; // PINNED: the only upscale-filter knob
    ctx.drawImage(tile as unknown as TDrawable, 0, 0, w, h, bounds.minX, bounds.minY, bw, bh);
    ctx.restore();
    this.release(tile);
  }

  /**
   * §3.4/§3.5 composite of a finished group layer onto its parent — the EXACT
   * same save/resetTransform/clip/globalAlpha/filter/blend/drawImage sequence
   * for both the freshly-rasterized miss path and a cache-blit hit, so a HIT is
   * byte-identical to a MISS. `bounds`/`unbounded` come from the layer (miss) or
   * the cache entry (hit); the composite params (opacity/blend/filters) always
   * come from the LIVE pushGroup command, never the cache.
   */
  /**
   * 0.34 luma matte: convert a layer's LUMINANCE to its alpha, in place —
   * `a' = round(luma(r,g,b) × a / 255)` with Rec.709 integer coefficients over
   * STRAIGHT (non-premultiplied) RGBA, the same discipline as the mesh kernel,
   * so both backends run one deterministic CPU pass and the result byte-compares.
   */
  private lumaToAlpha(ctx: Ctx2DLike<TPath, TDrawable>, w: number, h: number): void {
    // put/getImageData are spec'd transform-independent, but @napi-rs applies
    // the CURRENT transform to putImageData — the matte layer carries the
    // node's CTM, so an un-reset write-back lands SHIFTED (the disk-cache hit
    // path learned the same lesson: resetTransform before putImageData).
    const t = ctx.getTransform();
    ctx.resetTransform();
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const luma = (d[i]! * 2126 + d[i + 1]! * 7152 + d[i + 2]! * 722) / 2550000;
      d[i + 3] = Math.round(luma * d[i + 3]!);
    }
    ctx.putImageData(img, 0, 0);
    ctx.setTransform(t);
  }

  private composite(
    parent: Ctx2DLike<TPath, TDrawable>,
    parentLayer: { bounds: Bounds | null; unbounded: boolean },
    drawable: TDrawable,
    bounds: Bounds | null,
    unbounded: boolean,
    shaderReplaced: boolean,
    opacity: number,
    blend: string,
    filter: string | undefined,
    filters: FilterSpec[] | undefined,
    w: number,
    h: number,
  ): void {
    const hasFilter = filter !== undefined && filter !== 'none';
    const outset = hasFilter ? filterOutset(filters) : 0;

    // propagate this layer's painted box to the parent. Anything other than
    // source-over can touch destination pixels OUTSIDE the drawn content
    // (copy/in/out modes clear them) — treat as unboundable.
    if (unbounded || blend !== 'source-over') {
      parentLayer.unbounded = true;
    } else if (bounds) {
      accumulateRect(
        parentLayer,
        IDENTITY,
        bounds.minX - outset,
        bounds.minY - outset,
        bounds.maxX + outset,
        bounds.maxY + outset,
      );
    }

    // The composite draws the full-canvas layer, so ctx.filter pays for every
    // destination pixel — clip to the painted box + filter reach. Pixel-snapped:
    // identical inside, provably untouched outside. Only safe under source-over.
    const clippable = hasFilter && !shaderReplaced && !unbounded && blend === 'source-over';
    if (clippable && bounds === null) {
      // nothing was painted; a filtered source-over composite is a no-op
      return;
    }

    parent.save();
    parent.resetTransform();
    if (clippable && bounds) {
      const x0 = Math.max(0, Math.floor(bounds.minX - outset));
      const y0 = Math.max(0, Math.floor(bounds.minY - outset));
      const x1 = Math.min(w, Math.ceil(bounds.maxX + outset));
      const y1 = Math.min(h, Math.ceil(bounds.maxY + outset));
      if (x0 >= x1 || y0 >= y1) {
        // painted entirely offscreen; the filter can't reach back in
        parent.restore();
        return;
      }
      const clip = this.host.newPath();
      clip.moveTo(x0, y0);
      clip.lineTo(x1, y0);
      clip.lineTo(x1, y1);
      clip.lineTo(x0, y1);
      clip.closePath();
      parent.clip(clip, 'nonzero');
    }
    parent.globalAlpha = opacity;
    // group filters (§3.4): applied on the composite draw; save/restore scopes it
    if (hasFilter) parent.filter = filter;
    parent.globalCompositeOperation = blend;
    parent.drawImage(drawable, 0, 0);
    parent.restore();
  }

  /** The command walk — order and operations identical to the pre-extraction twins. */
  render(target: TCanvas, list: DisplayList): void {
    const { w, h } = list.size;
    if (target.width !== w) target.width = w;
    if (target.height !== h) target.height = h;
    const base = this.host.context(target);
    base.resetTransform();
    base.clearRect(0, 0, w, h);

    const layers: Layer<TPath, TDrawable, TCanvas>[] = [
      { ctx: base, canvas: null, opacity: 1, blend: 'source-over', bounds: null, unbounded: false },
    ];
    const ctxOf = () => layers[layers.length - 1]!.ctx;
    const top = () => layers[layers.length - 1]!;

    // Mirror of the canonical transform state, for device-space bounds
    // tracking. One stack suffices across layers: pushGroup copies the
    // parent's transform and popGroup composites outside the command stream.
    let mat: Mat2x3 = IDENTITY;
    const matStack: Mat2x3[] = [];

    const commands = list.commands;
    for (let ci = 0; ci < commands.length; ci++) {
      const cmd = commands[ci]!;
      switch (cmd.op) {
        case 'save':
          matStack.push(mat);
          ctxOf().save();
          break;
        case 'restore':
          mat = matStack.pop() ?? mat;
          ctxOf().restore();
          break;
        case 'transform':
          mat = multiply(mat, cmd.m);
          ctxOf().transform(cmd.m[0], cmd.m[1], cmd.m[2], cmd.m[3], cmd.m[4], cmd.m[5]);
          break;
        case 'clip':
          // shrinks the painted region — ignoring it keeps bounds conservative
          ctxOf().clip(this.path(list.resources, cmd.path), cmd.rule ?? 'nonzero');
          break;
        case 'fillPath': {
          const ctx = ctxOf();
          const b = this.pathBounds(list.resources, cmd.path);
          if (cmd.paint.kind === 'mesh' && b) {
            // §3 mesh: clip to the path, blit the shared-kernel ImageData upscaled
            // to the local bounds. ONE deterministic source buffer on both backends.
            this.fillMesh(ctx, this.path(list.resources, cmd.path), cmd.paint, b);
          } else {
            ctx.fillStyle = resolveFill(ctx, cmd.paint, b);
            ctx.fill(this.path(list.resources, cmd.path));
          }
          if (b) accumulateRect(top(), mat, b.minX, b.minY, b.maxX, b.maxY);
          break;
        }
        case 'strokePath': {
          const ctx = ctxOf();
          const sb = this.pathBounds(list.resources, cmd.path);
          ctx.strokeStyle = resolveFill(ctx, cmd.paint, sb);
          ctx.lineWidth = cmd.stroke.width;
          ctx.lineCap = cmd.stroke.cap ?? 'butt';
          ctx.lineJoin = cmd.stroke.join ?? 'miter';
          if (cmd.stroke.dash) {
            ctx.setLineDash(cmd.stroke.dash);
            ctx.lineDashOffset = cmd.stroke.dashOffset ?? 0;
          }
          ctx.stroke(this.path(list.resources, cmd.path));
          if (cmd.stroke.dash) {
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
          }
          if (sb) {
            // miter joins reach up to miterLimit (default 10) × width/2 = 5w
            const o = cmd.stroke.width * ((cmd.stroke.join ?? 'miter') === 'miter' ? 5 : 1);
            accumulateRect(top(), mat, sb.minX - o, sb.minY - o, sb.maxX + o, sb.maxY + o);
          }
          break;
        }
        case 'fillText': {
          const ctx = ctxOf();
          ctx.font = fontString(cmd.font);
          // Letter-spacing (tracking): write only when the FontSpec carries it,
          // so default Text never touches the (sticky) property — byte-identical
          // pixels. `ctx.letterSpacing` is honored on both the Skia/export path
          // (@napi-rs/canvas) and the modern browser 2D context, and it folds
          // into measureText below so the accumulated bbox tracks it. Reset to
          // '0px' after the draw so it can't leak onto a later un-tracked draw.
          const ls = cmd.font.letterSpacing;
          if (ls !== undefined && 'letterSpacing' in ctx) ctx.letterSpacing = `${ls}px`;
          // §3.6 STATIC variable-font passthrough: write the axes only when the
          // FontSpec carries them, so default Text never touches the (sticky)
          // property — byte-identical pixels. Applied where the context exposes
          // it (the Skia/export path: @napi-rs/canvas); the browser DOM 2D
          // context has no such property, so it's best-effort there (a one-time
          // dev-warn, never a throw). Reset to 'normal' after the draw so the
          // axes don't leak onto a later un-axed fillText in the same frame.
          const axes = cmd.font.fontVariationSettings;
          if (axes !== undefined) {
            if ('fontVariationSettings' in ctx) {
              ctx.fontVariationSettings = axes;
            } else if (!this.warnedFontVariation) {
              this.warnedFontVariation = true;
              emitDevWarning(
                "fontVariationSettings ('" + axes + "') is not applied here: this 2D context has no " +
                  'fontVariationSettings property (the browser DOM canvas) — variable-font axes render on ' +
                  'the Skia/export path; use the discrete fontWeight named instances for a browser weight (§3.6)',
              );
            }
          }
          ctx.fillStyle = resolveFill(ctx, cmd.paint, null);
          ctx.textBaseline = 'alphabetic';
          ctx.textAlign = cmd.align ?? 'left';
          ctx.fillText(cmd.text, cmd.x, cmd.y);
          if (axes !== undefined && 'fontVariationSettings' in ctx) ctx.fontVariationSettings = 'normal';
          try {
            const width = ctx.measureText(cmd.text).width;
            const align = cmd.align ?? 'left';
            const x0 = align === 'center' ? cmd.x - width / 2 : align === 'right' ? cmd.x - width : cmd.x;
            // generous em-margins absorb overhang/ascent/descent of any sane face
            const m = cmd.font.size;
            accumulateRect(top(), mat, x0 - m, cmd.y - 1.5 * m, x0 + width + m, cmd.y + 0.75 * m);
          } catch {
            top().unbounded = true;
          }
          if (ls !== undefined && 'letterSpacing' in ctx) ctx.letterSpacing = '0px';
          break;
        }
        case 'drawImage': {
          const res = list.resources[cmd.image];
          if (!res) throw new Error(`drawImage references missing resource ${cmd.image}`);
          const drawable = this.resolveDrawable(res, cmd.image);
          const ctx = ctxOf();
          if (cmd.smoothing !== undefined) ctx.imageSmoothingEnabled = cmd.smoothing;
          const { x, y, w: dw, h: dh } = cmd.dst;
          if (cmd.src) {
            ctx.drawImage(drawable, cmd.src.x, cmd.src.y, cmd.src.w, cmd.src.h, x, y, dw, dh);
          } else {
            ctx.drawImage(drawable, x, y, dw, dh);
          }
          accumulateRect(top(), mat, x, y, x + dw, y + dh);
          break;
        }
        case 'pushGroup': {
          const parent = ctxOf();
          // §3.5: a cacheKey + the inherited DEVICE transform (the layer bakes
          // it into pixels) is the LRU key. Shaders bypass the cache — they're
          // outside the determinism guarantee and mutate bounds post-raster.
          const lruKey =
            this.cacheEnabled && cmd.cacheKey !== undefined && cmd.shader === undefined
              ? `${cmd.cacheKey}@${transformKey(mat)}`
              : undefined;
          if (lruKey !== undefined) {
            const hit = this.cacheTouch(lruKey);
            if (hit) {
              // HIT: skip rasterizing the slice — composite the stored bitmap
              // exactly as the miss path would, then fast-forward to the
              // matching popGroup (balancing nested pushGroup depth).
              this.composite(
                parent,
                top(),
                hit.canvas as unknown as TDrawable,
                hit.bounds,
                hit.unbounded,
                false,
                cmd.opacity,
                cmd.matte !== undefined ? 'destination-in' : cmd.blend,
                filtersToCanvasFilter(cmd.filters),
                cmd.filters,
                w,
                h,
              );
              let depth = 1;
              while (depth > 0 && ++ci < commands.length) {
                const c = commands[ci]!;
                if (c.op === 'pushGroup') depth++;
                else if (c.op === 'popGroup') depth--;
              }
              break;
            }
            // §3.5 DISK tier: in-memory miss — try the persistent layer store. On a
            // hit, rebuild a device-space canvas from the stored RGBA (byte-exact
            // round-trip), promote it into the in-memory LRU for later frames this
            // render, and composite exactly as an in-memory hit would.
            const disk = this.layerStore?.get(lruKey);
            if (disk !== undefined && disk.w === w && disk.h === h) {
              const canvas = this.acquire(w, h);
              const dctx = this.host.context(canvas);
              dctx.resetTransform();
              const img = dctx.createImageData(w, h);
              img.data.set(disk.rgba);
              dctx.putImageData(img, 0, 0);
              this.cacheStore(lruKey, { canvas, bounds: disk.bounds, unbounded: disk.unbounded });
              this.composite(
                parent,
                top(),
                canvas as unknown as TDrawable,
                disk.bounds,
                disk.unbounded,
                false,
                cmd.opacity,
                cmd.matte !== undefined ? 'destination-in' : cmd.blend,
                filtersToCanvasFilter(cmd.filters),
                cmd.filters,
                w,
                h,
              );
              let depth = 1;
              while (depth > 0 && ++ci < commands.length) {
                const c = commands[ci]!;
                if (c.op === 'pushGroup') depth++;
                else if (c.op === 'popGroup') depth--;
              }
              break;
            }
          }
          const layerCanvas = this.acquire(w, h);
          const layerCtx = this.host.context(layerCanvas);
          layerCtx.resetTransform();
          layerCtx.clearRect(0, 0, w, h);
          // group content inherits the parent's current transform
          layerCtx.setTransform(parent.getTransform());
          layers.push({
            ctx: layerCtx,
            canvas: layerCanvas,
            opacity: cmd.opacity,
            blend: cmd.blend,
            filter: filtersToCanvasFilter(cmd.filters),
            filters: cmd.filters,
            ...(cmd.shader !== undefined ? { shader: cmd.shader } : {}),
            ...(cmd.matte !== undefined ? { matte: cmd.matte } : {}),
            bounds: null,
            unbounded: false,
            ...(lruKey !== undefined ? { cacheStoreKey: lruKey } : {}),
          });
          break;
        }
        case 'popGroup': {
          const layer = layers.pop();
          if (!layer || layer.canvas === null) throw new Error('popGroup without matching pushGroup');
          const parent = ctxOf();
          let drawable: TDrawable = layer.canvas as unknown as TDrawable;
          let shaderReplaced = false;
          if (layer.shader !== undefined) {
            const replaced = this.host.applyShader?.(layer.canvas, layer.shader, w, h) ?? null;
            if (replaced !== null) {
              drawable = replaced;
              // a shader can move pixels anywhere in the layer (displacement)
              shaderReplaced = true;
              layer.bounds = { minX: 0, minY: 0, maxX: w, maxY: h };
              layer.unbounded = false;
            } else if (this.shaderCaps === 'error') {
              throw new Error(
                'a ShaderEffect reached a backend without a shader runner (§3.7) — ' +
                  'load @glissade/effects-webgpu in the browser, or accept passthrough with caps.shaders: warn',
              );
            } else if (!this.warnedShaders) {
              this.warnedShaders = true;
              emitDevWarning(
                'ShaderEffect pass skipped: no shader runner here (headless or webgpu-less browser) — subtree composites unfiltered (§3.7 caps.shaders)',
              );
            }
          }

          // 0.34 track-matte: a matte layer keeps the DESTINATION (the content
          // already painted into the parent layer) only where THIS layer is
          // opaque — native destination-in, byte-exact on both canvases. Luma
          // mode first converts the layer's luminance to alpha via the shared
          // straight-alpha CPU kernel (no native luma operator exists on either
          // backend — the mesh-kernel precedent). Runs BEFORE any LRU store, so
          // a cached matte layer is stored post-kernel and replays correctly.
          if (layer.matte === 'luma' && !shaderReplaced) this.lumaToAlpha(layer.ctx, w, h);
          this.composite(
            parent,
            top(),
            drawable,
            layer.bounds,
            layer.unbounded,
            shaderReplaced,
            layer.opacity,
            layer.matte !== undefined ? 'destination-in' : layer.blend,
            layer.filter,
            layer.filters,
            w,
            h,
          );
          // §3.5: cache the rasterized layer instead of releasing it, so a
          // later frame with the same cacheKey + device transform re-blits it.
          // Only the un-shadered raw layer is cached (a shader replacement is a
          // fresh drawable, possibly not a pooled canvas). bounds/unbounded
          // ride along — the hit path can't recompute them.
          if (layer.cacheStoreKey !== undefined && !shaderReplaced) {
            this.cacheStore(layer.cacheStoreKey, {
              canvas: layer.canvas,
              bounds: layer.bounds,
              unbounded: layer.unbounded,
            });
            // §3.5 disk tier: persist the device-space raster (full w×h) so a
            // LATER render re-blits it even when the whole-frame cache is defeated
            // (a re-narration). Only reached on a MISS (first raster of the layer);
            // subsequent frames/renders hit RAM or disk and fast-forward past here.
            if (this.layerStore !== undefined) {
              const rgba = this.host.context(layer.canvas).getImageData(0, 0, w, h).data;
              this.layerStore.put(layer.cacheStoreKey, {
                rgba,
                w,
                h,
                bounds: layer.bounds,
                unbounded: layer.unbounded,
              });
            }
          } else {
            this.release(layer.canvas);
          }
          break;
        }
      }
    }
    if (layers.length !== 1) throw new Error('unbalanced pushGroup/popGroup in DisplayList');
  }
}

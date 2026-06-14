/**
 * The shared DisplayList interpreter (§3.4): one command walk over the
 * canvas-2d-shaped API, generic over the host's canvas/path/drawable types.
 * backend-canvas2d (DOM) and backend-skia (@napi-rs) instantiate it with
 * four-line adapters, so the twin rasterizers structurally cannot drift —
 * the golden + SSIM suites verify the refactor preserved every byte.
 */

import { emitDevWarning } from '@glissade/core';
import { ColdAssetError } from './assets.js';
import type { VideoFrameSource } from './assets.js';
import {
  filtersToCanvasFilter,
  type DisplayList,
  type FilterSpec,
  type FontSpec,
  type PathSeg,
  type Resource,
  type ShaderRef,
} from './displayList.js';
import { IDENTITY, multiply, type Mat2x3 } from './matrix.js';
export { type TextMetricsLite } from './text.js';

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
  lineDashOffset: number;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  textBaseline: string;
  textAlign: string;
  globalAlpha: number;
  globalCompositeOperation: string;
  filter: string;
  imageSmoothingEnabled: boolean;
}

export interface CanvasLike {
  width: number;
  height: number;
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
  /** device-space box of everything painted into this layer; null = nothing yet */
  bounds: Bounds | null;
  /** true once content can't be conservatively boxed → never clip, parent inherits */
  unbounded: boolean;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
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

  constructor(
    private readonly host: Raster2DHost<TCanvas, TPath, TDrawable>,
    /** caps.shaders (§3.7): what happens when a shader can't run here. */
    private readonly shaderCaps: ShaderCaps = 'warn',
  ) {}

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

    for (const cmd of list.commands) {
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
          ctx.fillStyle = cmd.paint.color;
          ctx.fill(this.path(list.resources, cmd.path));
          const b = this.pathBounds(list.resources, cmd.path);
          if (b) accumulateRect(top(), mat, b.minX, b.minY, b.maxX, b.maxY);
          break;
        }
        case 'strokePath': {
          const ctx = ctxOf();
          ctx.strokeStyle = cmd.paint.color;
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
          const b = this.pathBounds(list.resources, cmd.path);
          if (b) {
            // miter joins reach up to miterLimit (default 10) × width/2 = 5w
            const o = cmd.stroke.width * ((cmd.stroke.join ?? 'miter') === 'miter' ? 5 : 1);
            accumulateRect(top(), mat, b.minX - o, b.minY - o, b.maxX + o, b.maxY + o);
          }
          break;
        }
        case 'fillText': {
          const ctx = ctxOf();
          ctx.font = fontString(cmd.font);
          ctx.fillStyle = cmd.paint.color;
          ctx.textBaseline = 'alphabetic';
          ctx.textAlign = cmd.align ?? 'left';
          ctx.fillText(cmd.text, cmd.x, cmd.y);
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
            bounds: null,
            unbounded: false,
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

          const hasFilter = layer.filter !== undefined && layer.filter !== 'none';
          const outset = hasFilter ? filterOutset(layer.filters) : 0;

          // propagate this layer's painted box to the parent. Anything other
          // than source-over can touch destination pixels OUTSIDE the drawn
          // content (copy/in/out modes clear them) — treat as unboundable.
          const parentLayer = top();
          if (layer.unbounded || layer.blend !== 'source-over') {
            parentLayer.unbounded = true;
          } else if (layer.bounds) {
            accumulateRect(
              parentLayer,
              IDENTITY,
              layer.bounds.minX - outset,
              layer.bounds.minY - outset,
              layer.bounds.maxX + outset,
              layer.bounds.maxY + outset,
            );
          }

          // The composite draws the full-canvas layer, so ctx.filter pays for
          // every destination pixel — clip to the painted box + filter reach
          // (16× on software rasterizers). Pixel-snapped: identical inside,
          // provably untouched outside. Only safe under source-over.
          const clippable =
            hasFilter && !shaderReplaced && !layer.unbounded && layer.blend === 'source-over';
          if (clippable && layer.bounds === null) {
            // nothing was painted; a filtered source-over composite is a no-op
            this.release(layer.canvas);
            break;
          }

          parent.save();
          parent.resetTransform();
          if (clippable && layer.bounds) {
            const x0 = Math.max(0, Math.floor(layer.bounds.minX - outset));
            const y0 = Math.max(0, Math.floor(layer.bounds.minY - outset));
            const x1 = Math.min(w, Math.ceil(layer.bounds.maxX + outset));
            const y1 = Math.min(h, Math.ceil(layer.bounds.maxY + outset));
            if (x0 >= x1 || y0 >= y1) {
              // painted entirely offscreen; the filter can't reach back in
              parent.restore();
              this.release(layer.canvas);
              break;
            }
            const clip = this.host.newPath();
            clip.moveTo(x0, y0);
            clip.lineTo(x1, y0);
            clip.lineTo(x1, y1);
            clip.lineTo(x0, y1);
            clip.closePath();
            parent.clip(clip, 'nonzero');
          }
          parent.globalAlpha = layer.opacity;
          // group filters (§3.4): applied on the composite draw; save/restore scopes it
          if (hasFilter) parent.filter = layer.filter!;
          parent.globalCompositeOperation = layer.blend;
          parent.drawImage(drawable, 0, 0);
          parent.restore();
          this.release(layer.canvas);
          break;
        }
      }
    }
    if (layers.length !== 1) throw new Error('unbalanced pushGroup/popGroup in DisplayList');
  }
}

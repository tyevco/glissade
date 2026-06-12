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
  type FontSpec,
  type PathSeg,
  type Resource,
  type ShaderRef,
} from './displayList.js';
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
  shader?: ShaderRef; // §3.7 effect pass, applied before the composite
}

export class Raster2D<TCanvas extends CanvasLike, TPath extends PathLike, TDrawable> {
  private readonly pool: TCanvas[] = [];
  private readonly pathCache = new WeakMap<object, TPath>();
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
      { ctx: base, canvas: null, opacity: 1, blend: 'source-over' },
    ];
    const ctxOf = () => layers[layers.length - 1]!.ctx;

    for (const cmd of list.commands) {
      switch (cmd.op) {
        case 'save':
          ctxOf().save();
          break;
        case 'restore':
          ctxOf().restore();
          break;
        case 'transform':
          ctxOf().transform(cmd.m[0], cmd.m[1], cmd.m[2], cmd.m[3], cmd.m[4], cmd.m[5]);
          break;
        case 'clip':
          ctxOf().clip(this.path(list.resources, cmd.path), cmd.rule ?? 'nonzero');
          break;
        case 'fillPath': {
          const ctx = ctxOf();
          ctx.fillStyle = cmd.paint.color;
          ctx.fill(this.path(list.resources, cmd.path));
          break;
        }
        case 'strokePath': {
          const ctx = ctxOf();
          ctx.strokeStyle = cmd.paint.color;
          ctx.lineWidth = cmd.stroke.width;
          ctx.lineCap = cmd.stroke.cap ?? 'butt';
          ctx.lineJoin = cmd.stroke.join ?? 'miter';
          if (cmd.stroke.dash) ctx.setLineDash(cmd.stroke.dash);
          ctx.stroke(this.path(list.resources, cmd.path));
          if (cmd.stroke.dash) ctx.setLineDash([]);
          break;
        }
        case 'fillText': {
          const ctx = ctxOf();
          ctx.font = fontString(cmd.font);
          ctx.fillStyle = cmd.paint.color;
          ctx.textBaseline = 'alphabetic';
          ctx.textAlign = cmd.align ?? 'left';
          ctx.fillText(cmd.text, cmd.x, cmd.y);
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
            ...(cmd.shader !== undefined ? { shader: cmd.shader } : {}),
          });
          break;
        }
        case 'popGroup': {
          const layer = layers.pop();
          if (!layer || layer.canvas === null) throw new Error('popGroup without matching pushGroup');
          const parent = ctxOf();
          parent.save();
          parent.resetTransform();
          parent.globalAlpha = layer.opacity;
          // group filters (§3.4): applied on the composite draw; save/restore scopes it
          if (layer.filter !== undefined && layer.filter !== 'none') parent.filter = layer.filter;
          parent.globalCompositeOperation = layer.blend;
          let drawable: TDrawable = layer.canvas as unknown as TDrawable;
          if (layer.shader !== undefined) {
            const replaced = this.host.applyShader?.(layer.canvas, layer.shader, w, h) ?? null;
            if (replaced !== null) drawable = replaced;
            else if (this.shaderCaps === 'error') {
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

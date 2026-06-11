/**
 * @glissade/backend-canvas2d — rasterize DisplayLists onto Canvas 2D
 * (DESIGN.md §3.4–§3.5). Groups realize as pooled temporary canvases so
 * group opacity/blend composite correctly (children don't individually fade).
 */

import {
  ColdAssetError,
  type DisplayList,
  type DrawCommand,
  type FontSpec,
  type PathSeg,
  type Resource,
  type VideoFrameSource,
} from '@glissade/scene';

type Drawable = Exclude<CanvasImageSource, SVGImageElement>;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface TextMetricsLite {
  width: number;
  ascent: number;
  descent: number;
}

function fontString(font: FontSpec): string {
  const style = font.style === 'italic' ? 'italic ' : '';
  const weight = font.weight !== undefined && font.weight !== 400 ? `${font.weight} ` : '';
  return `${style}${weight}${font.size}px ${font.family}`;
}

function buildPath(segs: PathSeg[]): Path2D {
  const p = new Path2D();
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

interface Layer {
  ctx: Ctx2D;
  canvas: AnyCanvas | null; // null for the base layer
  opacity: number;
  blend: GlobalCompositeOperation;
}

export class Canvas2DBackend {
  private readonly target: AnyCanvas;
  private readonly pool: OffscreenCanvas[] = [];
  private pathCache = new WeakMap<object, Path2D>();
  private readonly images = new Map<string, Drawable>();
  private readonly videos = new Map<string, VideoFrameSource>();

  constructor(target: AnyCanvas) {
    this.target = target;
  }

  /** Register a decoded still (kind 'image' assets). */
  setImageAsset(assetId: string, image: Drawable): void {
    this.images.set(assetId, image);
  }

  /** Register a warmed-on-demand video source (kind 'video' assets, §3.8). */
  setVideoAsset(assetId: string, source: VideoFrameSource): void {
    this.videos.set(assetId, source);
  }

  private resolveDrawable(res: Resource, id: number): Drawable {
    if (res.kind === 'image') {
      const img = this.images.get(res.assetId);
      if (!img) throw new ColdAssetError(res.assetId, 'no decoded image registered');
      return img;
    }
    if (res.kind === 'videoFrame') {
      const source = this.videos.get(res.assetId);
      if (!source) throw new ColdAssetError(res.assetId, 'no VideoFrameSource registered', res.mediaT);
      try {
        return source.getFrameSync(res.mediaT) as Drawable;
      } catch (e) {
        // re-key on the asset id + requested time so callers can demand-warm
        if (e instanceof ColdAssetError) throw new ColdAssetError(res.assetId, e.detail, res.mediaT);
        throw e;
      }
    }
    throw new Error(`resource ${id} is not drawable`);
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
    const base = this.context(this.target);
    const { w, h } = list.size;
    if (this.target.width !== w) this.target.width = w;
    if (this.target.height !== h) this.target.height = h;
    base.resetTransform();
    base.clearRect(0, 0, w, h);

    const layers: Layer[] = [{ ctx: base, canvas: null, opacity: 1, blend: 'source-over' }];
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
          const layerCtx = layerCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
          layerCtx.resetTransform();
          layerCtx.clearRect(0, 0, w, h);
          // group content inherits the parent's current transform
          layerCtx.setTransform(parent.getTransform());
          layers.push({
            ctx: layerCtx,
            canvas: layerCanvas,
            opacity: cmd.opacity,
            blend: cmd.blend as GlobalCompositeOperation,
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
          parent.globalCompositeOperation = layer.blend;
          parent.drawImage(layer.canvas, 0, 0);
          parent.restore();
          this.release(layer.canvas as OffscreenCanvas);
          break;
        }
      }
    }
    if (layers.length !== 1) throw new Error('unbalanced pushGroup/popGroup in DisplayList');
  }

  async readPixels(): Promise<Uint8ClampedArray> {
    const ctx = this.context(this.target);
    return ctx.getImageData(0, 0, this.target.width, this.target.height).data;
  }

  dispose(): void {
    this.pool.length = 0;
  }

  private context(canvas: AnyCanvas): Ctx2D {
    const ctx = canvas.getContext('2d') as Ctx2D | null;
    if (!ctx) throw new Error('canvas 2d context unavailable');
    return ctx;
  }

  private path(resources: Resource[], id: number): Path2D {
    const res = resources[id];
    if (!res || res.kind !== 'path') throw new Error(`resource ${id} is not a path`);
    let p = this.pathCache.get(res);
    if (!p) {
      p = buildPath(res.segs);
      this.pathCache.set(res, p);
    }
    return p;
  }

  private acquire(w: number, h: number): OffscreenCanvas {
    const pooled = this.pool.pop();
    if (pooled) {
      if (pooled.width !== w) pooled.width = w;
      if (pooled.height !== h) pooled.height = h;
      return pooled;
    }
    return new OffscreenCanvas(w, h);
  }

  private release(canvas: OffscreenCanvas): void {
    if (this.pool.length < 8) this.pool.push(canvas);
  }
}

export type { DrawCommand, DisplayList };

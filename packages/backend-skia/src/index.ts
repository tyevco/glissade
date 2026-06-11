/**
 * @glissade/backend-skia — headless DisplayList rasterizer over @napi-rs/canvas
 * (DESIGN.md §3.4). The per-path-deterministic twin of backend-canvas2d: same
 * command walk, same temp-canvas group compositing, CPU Skia. The shared
 * interpreter extraction is tracked tech debt; the golden/SSIM suites guard
 * drift until then.
 */

import { createCanvas, Path2D, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import {
  type DisplayList,
  type FontSpec,
  type PathSeg,
  type Resource,
} from '@glissade/scene';

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
  ctx: SKRSContext2D;
  canvas: Canvas | null;
  opacity: number;
  blend: string;
}

export class SkiaBackend {
  private readonly canvas: Canvas;
  private readonly pool: Canvas[] = [];
  private pathCache = new WeakMap<object, Path2D>();

  constructor(width: number, height: number) {
    this.canvas = createCanvas(width, height);
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
    const { w, h } = list.size;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    const base = this.canvas.getContext('2d');
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
          ctx.fillText(cmd.text, cmd.x, cmd.y);
          break;
        }
        case 'drawImage':
          break; // image assets land with the M2+ asset table
        case 'pushGroup': {
          const parent = ctxOf();
          const layerCanvas = this.acquire(w, h);
          const layerCtx = layerCanvas.getContext('2d');
          layerCtx.resetTransform();
          layerCtx.clearRect(0, 0, w, h);
          layerCtx.setTransform(parent.getTransform());
          layers.push({ ctx: layerCtx, canvas: layerCanvas, opacity: cmd.opacity, blend: cmd.blend });
          break;
        }
        case 'popGroup': {
          const layer = layers.pop();
          if (!layer || layer.canvas === null) throw new Error('popGroup without matching pushGroup');
          const parent = ctxOf();
          parent.save();
          parent.resetTransform();
          parent.globalAlpha = layer.opacity;
          parent.globalCompositeOperation = layer.blend as never;
          parent.drawImage(layer.canvas, 0, 0);
          parent.restore();
          this.release(layer.canvas);
          break;
        }
      }
    }
    if (layers.length !== 1) throw new Error('unbalanced pushGroup/popGroup in DisplayList');
  }

  /** Raw RGBA — the FFmpeg pipe path (§5.1d). Synchronous; no GPU readback. */
  readPixels(): Uint8ClampedArray {
    const ctx = this.canvas.getContext('2d');
    return ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
  }

  /** Deterministic PNG bytes for golden frames and `gs render` output. */
  encodePng(): Buffer {
    return this.canvas.toBuffer('image/png');
  }

  dispose(): void {
    this.pool.length = 0;
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

  private acquire(w: number, h: number): Canvas {
    const pooled = this.pool.pop();
    if (pooled) {
      if (pooled.width !== w) pooled.width = w;
      if (pooled.height !== h) pooled.height = h;
      return pooled;
    }
    return createCanvas(w, h);
  }

  private release(canvas: Canvas): void {
    if (this.pool.length < 8) this.pool.push(canvas);
  }
}

// @glissade/backend-dom — a DOM/SVG RenderBackend (DESIGN.md §3.4; the
// docs/design/dom-backend.md memo, Stage S2 "forward render").
//
// Consumes the IDENTICAL DisplayList IR the canvas2d/skia backends consume, but
// emits HTML/SVG ELEMENTS instead of pixels. It is explicitly PREVIEW /
// NON-PARITY: there is no canvas, so neither Skia byte-exactness nor browser↔Skia
// SSIM applies — it is never on the `gs render` path. Its value is elsewhere:
// accessibility + selectable text, CSS-native embedding, and a zero-raster
// structural preview of a scene.
//
// Element strategy: ONE HTML `<div>` root; HTML divs carry structure / transform
// / group / text; inline `<svg>` islands carry path / gradient / clip / image
// geometry. (A single root `<svg>` would force text + groups into `<foreignObject>`
// and lose the CSS-native embedding that is this backend's reason to exist.)
//
// Node identity rides OUT-OF-BAND: `render()` stamps `data-node-id` from an id
// stream set via `setIds()` (the `@glissade/scene/identity` `emitWithIds` stream);
// the DrawCommands themselves stay identity-less, exactly as shipped.

import { emitDevWarning } from '@glissade/core';
import {
  ALL_FILTER_KINDS,
  fontString,
  filtersToCanvasFilter,
  type BackendCaps,
  type BlendMode,
  type DisplayList,
  type FontSpec,
  type Mat2x3,
  type Paint,
  type PathSeg,
  type RenderBackend,
  type Resource,
  type StrokeStyle,
  type TextMetricsLite,
  type VideoFrameSource,
} from '@glissade/scene';
// Out-of-band identity stream (S1) — TYPE ONLY, so importing it pulls no runtime
// code and keeps `@glissade/scene/identity` off this package's value graph.
import type { NodeIdStream } from '@glissade/scene/identity';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** CSS `matrix(a,b,c,d,e,f)` from the IR's Mat2x3 `[a,b,c,d,e,f]`. */
function cssMatrix(m: Mat2x3): string {
  return `matrix(${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}, ${m[4]}, ${m[5]})`;
}

/** `BlendMode` → CSS `mix-blend-mode` keyword. `source-over` is `normal`; the
 * rest are valid CSS keywords 1:1. (CSS blend isolation differs subtly from
 * canvas `globalCompositeOperation`; acceptable under the non-parity stance.) */
function blendToCss(blend: BlendMode): string {
  return blend === 'source-over' ? 'normal' : blend;
}

/** A point on a (possibly rotated) ellipse at parameter angle `theta`. */
function ellipsePoint(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  phi: number,
  theta: number,
): [number, number] {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  return [cx + rx * ct * cp - ry * st * sp, cy + rx * ct * sp + ry * st * cp];
}

/** An `['E', cx, cy, rx, ry, rot, a0, a1]` ellipse seg → SVG path commands
 * (`M start A … [A …]`). SVG can't draw a ≥360° arc in one `A`, so a full
 * ellipse splits into two half-arcs. The dominant `E` producer is
 * `roundedRectSegs`/`Circle`, whose quarter/full arcs this reconstructs exactly. */
function ellipseToArcs(seg: ['E', number, number, number, number, number, number, number]): string {
  const [, cx, cy, rx, ry, rot, a0, a1] = seg;
  const rotDeg = (rot * 180) / Math.PI;
  const delta = a1 - a0;
  const sweep = delta >= 0 ? 1 : 0;
  const [sx, sy] = ellipsePoint(cx, cy, rx, ry, rot, a0);
  const out = [`M${sx} ${sy}`];
  if (Math.abs(delta) >= 2 * Math.PI - 1e-9) {
    const dir = sweep ? Math.PI : -Math.PI;
    const [mx, my] = ellipsePoint(cx, cy, rx, ry, rot, a0 + dir);
    const [ex, ey] = ellipsePoint(cx, cy, rx, ry, rot, a0 + 2 * dir);
    out.push(`A${rx} ${ry} ${rotDeg} 0 ${sweep} ${mx} ${my}`);
    out.push(`A${rx} ${ry} ${rotDeg} 0 ${sweep} ${ex} ${ey}`);
  } else {
    const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
    const [ex, ey] = ellipsePoint(cx, cy, rx, ry, rot, a1);
    out.push(`A${rx} ${ry} ${rotDeg} ${largeArc} ${sweep} ${ex} ${ey}`);
  }
  return out.join(' ');
}

/** Turn a `PathSeg[]` into an SVG `d` attribute (M/L/C/Q/E/Z — the full set). */
function segsToD(segs: readonly PathSeg[]): string {
  const parts: string[] = [];
  for (const seg of segs) {
    switch (seg[0]) {
      case 'M':
        parts.push(`M${seg[1]} ${seg[2]}`);
        break;
      case 'L':
        parts.push(`L${seg[1]} ${seg[2]}`);
        break;
      case 'C':
        parts.push(`C${seg[1]} ${seg[2]} ${seg[3]} ${seg[4]} ${seg[5]} ${seg[6]}`);
        break;
      case 'Q':
        parts.push(`Q${seg[1]} ${seg[2]} ${seg[3]} ${seg[4]}`);
        break;
      case 'E':
        parts.push(ellipseToArcs(seg));
        break;
      case 'Z':
        parts.push('Z');
        break;
    }
  }
  return parts.join(' ');
}

/**
 * A DOM/SVG `RenderBackend`. Construct with a host element (renders into it) or a
 * bare `Document` (builds a detached `root` you read off `backend.root`). Each
 * `render()` rebuilds the tree (forward render; the cross-frame retained-DOM
 * reconciler is Stage S3). Preview / non-parity — see the module header.
 */
export class DomBackend implements RenderBackend {
  readonly root: HTMLElement;
  readonly #doc: Document;
  readonly #host: HTMLElement | null;
  readonly #images = new Map<string, unknown>();
  readonly #videos = new Map<string, VideoFrameSource>();

  #ids: NodeIdStream = [];
  #defCounter = 0;
  #measureSpan: HTMLElement | null = null;
  #warnedMeasure = false;
  #warnedMesh = false;
  #warnedGradientInterp = false;
  #warnedShader = false;

  constructor(target: HTMLElement | Document) {
    const isDoc = target.nodeType === 9; // Node.DOCUMENT_NODE
    this.#doc = isDoc ? (target as Document) : ((target as HTMLElement).ownerDocument ?? (target as unknown as Document));
    this.#host = isDoc ? null : (target as HTMLElement);
    this.root = this.#doc.createElement('div');
    this.root.setAttribute('data-gs-dom', '');
    this.root.style.position = 'relative';
    this.root.style.overflow = 'hidden';
    if (this.#host) this.#host.appendChild(this.root);
  }

  readonly caps: BackendCaps = {
    // CSS `filter` covers the entire closed FilterSpec union natively.
    filters: ALL_FILTER_KINDS,
    // No WebGPU shader pass in a DOM tree.
    shaders: false,
    maxTextureSize: 16384,
  };

  /** Supply the out-of-band id stream (S1 `emitWithIds().ids`) the next
   * `render()` stamps as `data-node-id`. Positional by command index. */
  setIds(ids: NodeIdStream): void {
    this.#ids = ids;
  }

  render(list: DisplayList): void {
    const doc = this.#doc;
    const ids = this.#ids;
    this.#defCounter = 0;
    // Forward render: clear and rebuild (S3 adds cross-frame patching).
    this.root.replaceChildren();
    this.root.style.width = `${list.size.w}px`;
    this.root.style.height = `${list.size.h}px`;

    let cursor: HTMLElement = this.root;
    const stack: HTMLElement[] = [];

    const stamp = (el: Element, i: number): void => {
      const id = ids[i];
      if (id !== undefined) el.setAttribute('data-node-id', id);
    };
    const pathSegs = (id: number): readonly PathSeg[] => {
      const res: Resource | undefined = list.resources[id];
      return res && res.kind === 'path' ? res.segs : [];
    };
    /** A fresh `<svg>` geometry island absolutely positioned over the cursor. */
    const island = (): SVGSVGElement => {
      const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
      svg.setAttribute('width', String(list.size.w));
      svg.setAttribute('height', String(list.size.h));
      svg.style.position = 'absolute';
      svg.style.left = '0';
      svg.style.top = '0';
      svg.style.overflow = 'visible';
      return svg;
    };

    list.commands.forEach((cmd, i) => {
      switch (cmd.op) {
        case 'save': {
          stack.push(cursor);
          break;
        }
        case 'restore': {
          cursor = stack.pop() ?? this.root;
          break;
        }
        case 'transform': {
          const wrap = doc.createElement('div');
          wrap.style.position = 'absolute';
          wrap.style.transformOrigin = '0 0';
          wrap.style.transform = cssMatrix(cmd.m);
          stamp(wrap, i);
          cursor.appendChild(wrap);
          cursor = wrap; // unwound by the enclosing `restore` (no push)
          break;
        }
        case 'clip': {
          const id = `gsclip${this.#defCounter++}`;
          const svg = island();
          const defs = doc.createElementNS(SVG_NS, 'defs');
          const cp = doc.createElementNS(SVG_NS, 'clipPath');
          cp.setAttribute('id', id);
          cp.setAttribute('clipPathUnits', 'userSpaceOnUse');
          const p = doc.createElementNS(SVG_NS, 'path');
          p.setAttribute('d', segsToD(pathSegs(cmd.path)));
          p.setAttribute('clip-rule', cmd.rule ?? 'nonzero');
          cp.appendChild(p);
          defs.appendChild(cp);
          svg.appendChild(defs);
          cursor.appendChild(svg);
          // open a clip wrapper subsequent draws nest under (unwound by restore)
          const wrap = doc.createElement('div');
          wrap.style.position = 'absolute';
          wrap.style.left = '0';
          wrap.style.top = '0';
          wrap.style.clipPath = `url(#${id})`;
          stamp(wrap, i);
          cursor.appendChild(wrap);
          cursor = wrap;
          break;
        }
        case 'fillPath': {
          const svg = island();
          const path = doc.createElementNS(SVG_NS, 'path');
          path.setAttribute('d', segsToD(pathSegs(cmd.path)));
          path.setAttribute('fill', this.#resolvePaint(cmd.paint, svg, path));
          stamp(path, i);
          svg.appendChild(path);
          cursor.appendChild(svg);
          break;
        }
        case 'strokePath': {
          const svg = island();
          const path = doc.createElementNS(SVG_NS, 'path');
          path.setAttribute('d', segsToD(pathSegs(cmd.path)));
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', this.#resolvePaint(cmd.paint, svg, path));
          applyStroke(path, cmd.stroke);
          stamp(path, i);
          svg.appendChild(path);
          cursor.appendChild(svg);
          break;
        }
        case 'fillText': {
          const div = doc.createElement('div');
          div.style.position = 'absolute';
          div.style.left = `${cmd.x}px`;
          // canvas `y` is a BASELINE; CSS `top` is the box top — lift by ~1em so
          // the text box sits near the baseline. Non-parity: an approximation.
          div.style.top = `${cmd.y}px`;
          div.style.transform = 'translateY(-0.8em)';
          div.style.whiteSpace = 'pre';
          div.style.font = fontString(cmd.font);
          if (cmd.font.fontVariationSettings !== undefined) {
            div.style.fontVariationSettings = cmd.font.fontVariationSettings;
          }
          div.style.color = this.#solid(cmd.paint);
          // A non-solid text fill (gradient/mesh) has no CSS text analogue here —
          // flag the approximation so an editor can badge it (design-agent ask).
          if (cmd.paint.kind !== 'color') div.setAttribute('data-approx', 'true');
          if (cmd.align) div.style.textAlign = cmd.align;
          div.textContent = cmd.text;
          stamp(div, i);
          cursor.appendChild(div);
          break;
        }
        case 'drawImage': {
          const res: Resource | undefined = list.resources[cmd.image];
          const assetId = res && (res.kind === 'image' || res.kind === 'videoFrame') ? res.assetId : undefined;
          const img = doc.createElement('img');
          img.style.position = 'absolute';
          img.style.left = `${cmd.dst.x}px`;
          img.style.top = `${cmd.dst.y}px`;
          img.style.width = `${cmd.dst.w}px`;
          img.style.height = `${cmd.dst.h}px`;
          img.style.objectFit = 'fill';
          if (cmd.smoothing === false) img.style.imageRendering = 'pixelated';
          if (assetId !== undefined) {
            img.setAttribute('data-asset-id', assetId);
            const src = this.#imageSrc(assetId);
            if (src !== undefined) img.src = src;
          }
          stamp(img, i);
          cursor.appendChild(img);
          break;
        }
        case 'pushGroup': {
          const wrap = doc.createElement('div');
          wrap.style.position = 'absolute';
          wrap.style.left = '0';
          wrap.style.top = '0';
          if (cmd.opacity !== 1) wrap.style.opacity = String(cmd.opacity);
          const blend = blendToCss(cmd.blend);
          if (blend !== 'normal') wrap.style.mixBlendMode = blend;
          if (cmd.filters.length > 0) wrap.style.filter = filtersToCanvasFilter(cmd.filters);
          // cacheKey is IGNORED (no raster cache in a DOM tree — just render).
          if (cmd.shader !== undefined && !this.#warnedShader) {
            emitDevWarning('@glissade/backend-dom: a ShaderEffect (pushGroup.shader) has no DOM analogue — ignored (caps.shaders=false).');
            this.#warnedShader = true;
          }
          stamp(wrap, i);
          cursor.appendChild(wrap);
          stack.push(cursor);
          cursor = wrap;
          break;
        }
        case 'popGroup': {
          cursor = stack.pop() ?? this.root;
          break;
        }
      }
    });
  }

  measureText(text: string, font: FontSpec): TextMetricsLite {
    const size = font.size;
    const span = this.#ensureMeasureSpan();
    span.style.font = fontString(font);
    span.style.fontVariationSettings = font.fontVariationSettings ?? 'normal';
    span.textContent = text;
    const width = span.getBoundingClientRect().width;
    if (width === 0 && text.length > 0) {
      // No layout engine (e.g. jsdom): fall back to a coarse estimate and say so.
      if (!this.#warnedMeasure) {
        emitDevWarning(
          '@glissade/backend-dom: text measurement is unavailable in this environment (no layout engine, e.g. jsdom) — using a coarse estimate. Line-breaking will diverge from the canvas/export path (this is a preview/non-parity backend).',
        );
        this.#warnedMeasure = true;
      }
      return { width: 0.6 * size * text.length, ascent: 0.8 * size, descent: 0.2 * size };
    }
    return { width, ascent: 0.8 * size, descent: 0.2 * size };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async readPixels(): Promise<Uint8ClampedArray> {
    throw new Error(
      '@glissade/backend-dom has no pixel buffer (preview/non-parity backend — there is no canvas to read). Use @glissade/backend-canvas2d or @glissade/backend-skia for pixel readback.',
    );
  }

  setImageAsset(assetId: string, image: unknown): void {
    this.#images.set(assetId, image);
  }

  setVideoAsset(assetId: string, source: VideoFrameSource): void {
    this.#videos.set(assetId, source);
  }

  dispose(): void {
    this.root.replaceChildren();
    if (this.#host && this.root.parentNode === this.#host) this.#host.removeChild(this.root);
    this.#measureSpan?.remove();
    this.#measureSpan = null;
    this.#images.clear();
    this.#videos.clear();
  }

  // ---- internals -----------------------------------------------------------

  #ensureMeasureSpan(): HTMLElement {
    if (this.#measureSpan) return this.#measureSpan;
    const span = this.#doc.createElement('span');
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    span.style.whiteSpace = 'pre';
    span.style.left = '-99999px';
    span.style.top = '0';
    // The span must be in the live layout tree to measure; prefer the host (in
    // the real DOM), else <body>, else the detached root (measures 0 → estimate).
    (this.#host ?? this.#doc.body ?? this.root).appendChild(span);
    this.#measureSpan = span;
    return span;
  }

  /** Best-effort `src` for a registered image asset (an `HTMLImageElement` or a
   * URL string); other shapes have no DOM-loadable src in this preview tier. */
  #imageSrc(assetId: string): string | undefined {
    const a = this.#images.get(assetId);
    if (typeof a === 'string') return a;
    if (a && typeof a === 'object' && 'src' in a && typeof (a as { src: unknown }).src === 'string') {
      return (a as { src: string }).src;
    }
    return undefined;
  }

  #solid(paint: Paint): string {
    if (paint.kind === 'color') return paint.color;
    if (paint.kind === 'mesh') return paint.bg ?? paint.points[0]?.color ?? '#000';
    return paint.stops[0]?.color ?? '#000';
  }

  /** Resolve a `Paint` to an SVG fill/stroke value, appending any gradient def to
   * `svg`'s `<defs>`. `mesh` degrades to a solid (CSS/SVG has no mesh gradient);
   * a degraded paint stamps `data-approx="true"` on `el` so an editor can badge
   * the approximation (design-agent consumer ask). */
  #resolvePaint(paint: Paint, svg: SVGSVGElement, el: Element): string {
    if (paint.kind === 'color') return paint.color;
    if (paint.kind === 'mesh') {
      el.setAttribute('data-approx', 'true');
      if (!this.#warnedMesh) {
        emitDevWarning('@glissade/backend-dom: mesh-gradient paint has no SVG analogue — degraded to a solid fill.');
        this.#warnedMesh = true;
      }
      return this.#solid(paint);
    }
    if (paint.interpolation !== undefined && paint.interpolation !== 'linear') {
      el.setAttribute('data-approx', 'true');
      if (!this.#warnedGradientInterp) {
        emitDevWarning(
          `@glissade/backend-dom: gradient interpolation '${paint.interpolation}' has no SVG analogue — degraded to linear stops.`,
        );
        this.#warnedGradientInterp = true;
      }
    }
    const doc = this.#doc;
    const id = `gsgrad${this.#defCounter++}`;
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = doc.createElementNS(SVG_NS, 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    const grad = doc.createElementNS(SVG_NS, paint.kind === 'radial' ? 'radialGradient' : 'linearGradient');
    grad.setAttribute('id', id);
    if (paint.kind === 'linear') {
      if (paint.from && paint.to) {
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        grad.setAttribute('x1', String(paint.from[0]));
        grad.setAttribute('y1', String(paint.from[1]));
        grad.setAttribute('x2', String(paint.to[0]));
        grad.setAttribute('y2', String(paint.to[1]));
      } // else default objectBoundingBox (x1=0,y1=0,x2=1,y2=0 per SVG default)
    } else {
      if (paint.center && paint.radius !== undefined) {
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        grad.setAttribute('cx', String(paint.center[0]));
        grad.setAttribute('cy', String(paint.center[1]));
        grad.setAttribute('r', String(paint.radius));
      } // else default objectBoundingBox (cx=cy=r=0.5 per SVG default)
    }
    for (const stop of paint.stops) {
      const s = doc.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', String(stop.offset));
      s.setAttribute('stop-color', stop.color);
      grad.appendChild(s);
    }
    defs.appendChild(grad);
    return `url(#${id})`;
  }
}

/** Map a `StrokeStyle` onto an SVG `<path>`'s stroke-* attributes 1:1. */
function applyStroke(path: SVGPathElement, stroke: StrokeStyle): void {
  path.setAttribute('stroke-width', String(stroke.width));
  if (stroke.cap) path.setAttribute('stroke-linecap', stroke.cap);
  if (stroke.join) path.setAttribute('stroke-linejoin', stroke.join);
  if (stroke.miterLimit !== undefined) path.setAttribute('stroke-miterlimit', String(stroke.miterLimit));
  if (stroke.dash && stroke.dash.length > 0) path.setAttribute('stroke-dasharray', stroke.dash.join(' '));
  if (stroke.dashOffset !== undefined) path.setAttribute('stroke-dashoffset', String(stroke.dashOffset));
}

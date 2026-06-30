// @glissade/backend-dom — a DOM/SVG RenderBackend (DESIGN.md §3.4; the
// docs/design/dom-backend.md memo, Stage S3 "retained-DOM reconciler").
//
// Consumes the IDENTICAL DisplayList IR the canvas2d/skia backends consume, but
// emits HTML/SVG ELEMENTS instead of pixels. It is explicitly PREVIEW /
// NON-PARITY: there is no canvas, so neither Skia byte-exactness nor browser↔Skia
// SSIM applies — it is never on the `gs render` path. Its value is elsewhere:
// accessibility + selectable text, CSS-native embedding, and a zero-raster
// structural preview of a scene that hosts a click-to-edit editor.
//
// Element strategy: ONE HTML `<div>` root; HTML divs carry structure / transform
// / group / text; inline `<svg>` islands carry path / gradient / clip / image
// geometry. (A single root `<svg>` would force text + groups into `<foreignObject>`
// and lose the CSS-native embedding that is this backend's reason to exist.)
//
// Node identity rides OUT-OF-BAND: `render()` stamps `data-node-id` from an id
// stream set via `setIds()` (the `@glissade/scene/identity` `emitWithIds` stream);
// the DrawCommands themselves stay identity-less, exactly as shipped.
//
// === S3: RETAINED-DOM RECONCILER ===
// Each `render()` REUSES + PATCHES a tree retained across frames instead of
// rebuilding it, so inline-edit state (caret/focus/selection), host overlays,
// event listeners, and CSS transitions survive a re-render. The forward walk
// (cursor + stack discipline, per-op element construction) is preserved
// verbatim; every `appendChild` is routed through `matchOrCreate` and every
// style/attr/text write through a compare-then-write helper. Ownership is
// defined by membership in per-cursor `children` Maps stored in a WeakMap keyed
// off the owning cursor element — the reconciler creates / moves / removes /
// mutates ONLY those nodes, so foreign DOM the host injects is never touched.

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

/** An `['E', cx, cy, rx, ry, rot, a0, a1]` ellipse seg → SVG path commands. When
 * `continues` (an open subpath precedes it — e.g. a rounded-rect corner after an
 * edge `L`) it leads with `L start` so the contour stays ONE continuous subpath
 * (a stray `M` would break the fill — e1JP5_1IzI2D); standalone (a Circle's `E`
 * is the first seg) it leads with `M start`. SVG can't draw a ≥360° arc in one
 * `A`, so a full ellipse splits into two half-arcs. The dominant `E` producer is
 * `roundedRectSegs`/`Circle`, whose quarter/full arcs this reconstructs exactly. */
function ellipseToArcs(
  seg: ['E', number, number, number, number, number, number, number],
  continues: boolean,
): string {
  const [, cx, cy, rx, ry, rot, a0, a1] = seg;
  const rotDeg = (rot * 180) / Math.PI;
  const delta = a1 - a0;
  const sweep = delta >= 0 ? 1 : 0;
  const [sx, sy] = ellipsePoint(cx, cy, rx, ry, rot, a0);
  const out = [`${continues ? 'L' : 'M'}${sx} ${sy}`];
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
  // Track whether a subpath is currently open (has a current point). An `E`
  // mid-subpath (e.g. a rounded-rect corner following an edge `L`) must CONTINUE
  // the contour, not start a new `M` subpath — a stray moveto breaks the shape
  // into disconnected open subpaths that don't fill (e1JP5_1IzI2D).
  let open = false;
  for (const seg of segs) {
    switch (seg[0]) {
      case 'M':
        parts.push(`M${seg[1]} ${seg[2]}`);
        open = true;
        break;
      case 'L':
        parts.push(`L${seg[1]} ${seg[2]}`);
        open = true;
        break;
      case 'C':
        parts.push(`C${seg[1]} ${seg[2]} ${seg[3]} ${seg[4]} ${seg[5]} ${seg[6]}`);
        open = true;
        break;
      case 'Q':
        parts.push(`Q${seg[1]} ${seg[2]} ${seg[3]} ${seg[4]}`);
        open = true;
        break;
      case 'E':
        parts.push(ellipseToArcs(seg, open));
        open = true;
        break;
      case 'Z':
        parts.push('Z');
        open = false;
        break;
    }
  }
  return parts.join(' ');
}

/**
 * Axis-aligned bounding box of a path in its LOCAL coordinate space, or null for
 * an empty path. Curve control points give a safe superset (the painted curve
 * never exceeds its hull); `E` uses `max(rx,ry)` so the box contains the ellipse
 * at any rotation (exact for the rounded-rect `rx==ry` case). Used to size each
 * shape's `<svg>` island TIGHTLY around its geometry instead of full-canvas —
 * the paint is unchanged (the viewBox maps local coords 1:1), but the SVG box no
 * longer spans the whole viewport, so shapes don't overlap as giant transparent
 * hit-targets.
 */
function pathBBox(segs: readonly PathSeg[]): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const pt = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
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
      case 'Z':
        break;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Short, stable FNV-1a hash (hex) over a string — for deterministic def ids
 * that survive reorder (same scope+key → same id across frames). */
function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

/**
 * Per-cursor reconciliation record. Stored in a WeakMap keyed off the cursor
 * element (so the record dies with its element). `children` is the SOLE
 * definition of reconciler ownership: a key → the owned OUTER element placed
 * directly under this cursor. `occ`/`seen`/`frame`/`anchor` are per-render
 * scratch reset exactly once when a reused cursor is re-entered this frame.
 */
interface CursorRecon {
  children: Map<string, Element>;
  /** Every DOM node the reconciler owns directly under this cursor — keyed outer
   * elements PLUS clip aux islands. Drives the foreign-step in placement. */
  owns: Set<Node>;
  occ: Map<string, number>;
  seen: Set<string>;
  frame: number;
  anchor: Node | null;
}

/**
 * Per-owned-element record. `el` is the keyed outer element; `aux` the clip
 * `<svg>` island that travels with its wrapper; `path` the inner `<path>` for
 * fill/stroke/clip; `defId` the deterministic clip/gradient def id; `gradKey`
 * the last-applied gradient signature (skip a `<defs>` rebuild when unchanged);
 * `props` the last-applied value cache that drives compare-then-write.
 */
interface Owned {
  op: string;
  el: Element;
  aux?: Element;
  path?: SVGPathElement;
  defId?: string;
  gradKey?: string;
  props: Record<string, string | undefined>;
}

/** Construction options for {@link DomBackend}. */
export interface DomBackendOptions {
  /**
   * Called when web fonts finish loading (and on later lazy `@font-face`
   * batches). **Re-render in this callback** so text re-wraps with the loaded
   * fonts — wrapping is computed upstream in the scene from this backend's
   * `measureText`, so a caption measured before its font loaded can render
   * unwrapped at first paint. Typically `() => drive(currentTime)` in a host's
   * draw loop. No-op where `document.fonts` is absent (e.g. jsdom).
   */
  onReflow?: () => void;
}

/**
 * A DOM/SVG `RenderBackend`. Construct with a host element (renders into it) or a
 * bare `Document` (builds a detached `root` you read off `backend.root`). Each
 * `render()` REUSES + PATCHES a retained tree keyed on `data-node-id` (Stage S3),
 * so inline-edit state, host overlays, listeners, and CSS transitions survive a
 * re-render. Preview / non-parity — see the module header.
 */
export class DomBackend implements RenderBackend {
  readonly root: HTMLElement;
  readonly #doc: Document;
  readonly #host: HTMLElement | null;
  readonly #images = new Map<string, unknown>();
  readonly #videos = new Map<string, VideoFrameSource>();

  // Retained reconciliation state.
  #frame = 0;
  readonly #recon = new WeakMap<Element, CursorRecon>();
  readonly #owned = new WeakMap<Element, Owned>();

  #ids: NodeIdStream = [];
  readonly #onReflow: (() => void) | undefined;
  #measureSpan: HTMLElement | null = null;
  #warnedMeasure = false;
  #warnedMesh = false;
  #warnedGradientInterp = false;
  #warnedShader = false;
  #warnedUnbalanced = false;

  constructor(target: HTMLElement | Document, opts: DomBackendOptions = {}) {
    const isDoc = target.nodeType === 9; // Node.DOCUMENT_NODE
    this.#doc = isDoc ? (target as Document) : ((target as HTMLElement).ownerDocument ?? (target as unknown as Document));
    this.#host = isDoc ? null : (target as HTMLElement);
    this.root = this.#doc.createElement('div');
    this.root.setAttribute('data-gs-dom', '');
    this.root.style.position = 'relative';
    this.root.style.overflow = 'hidden';
    if (this.#host) this.#host.appendChild(this.root);
    this.#onReflow = opts.onReflow;
    this.#wireFontReflow();
  }

  /**
   * When web fonts finish loading, fire `onReflow` so the HOST re-renders. Text
   * wrapping is computed UPSTREAM in the scene (from this backend's `measureText`),
   * so a caption measured before its font loaded wraps on the fallback-font
   * estimate and can render unwrapped at first paint. The backend can't re-wrap
   * alone — the line breaks already live in the DisplayList the scene produced —
   * so per the passive-sink contract it SIGNALS, and the host re-evaluates with
   * the now-loaded fonts. No-op when no `onReflow` is given or the environment
   * has no `document.fonts` (e.g. jsdom).
   */
  #wireFontReflow(): void {
    const reflow = this.#onReflow;
    if (!reflow) return;
    const fonts = (this.#doc as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    // the initial web-font set finishing → re-wrap once
    void fonts.ready?.then?.(() => reflow())?.catch?.(() => {});
    // lazily-loaded @font-face batches → re-wrap on each
    fonts.addEventListener?.('loadingdone', () => reflow());
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
    this.#frame++;
    // Retained render: REUSE + PATCH (no replaceChildren). The root is sized via
    // compare-then-write; foreign children the host added to the root survive.
    this.#enterCursor(this.root, '');
    {
      const w = `${list.size.w}px`;
      const h = `${list.size.h}px`;
      if (this.root.style.width !== w) this.root.style.width = w;
      if (this.root.style.height !== h) this.root.style.height = h;
    }

    let cursor: HTMLElement = this.root;
    const stack: HTMLElement[] = [];
    // Scope path: chain of owner keys threaded as we descend, for globally-unique
    // def ids though per-cursor keys are scope-local. Parallels `stack`.
    let scope = '';
    const scopeStack: string[] = [];

    const pathSegs = (id: number): readonly PathSeg[] => {
      const res: Resource | undefined = list.resources[id];
      return res && res.kind === 'path' ? res.segs : [];
    };
    /**
     * A fresh `<svg>` geometry island. Starts collapsed (0×0) — fillPath/
     * strokePath size it TIGHTLY to the path bbox per render (#sizeIsland);
     * clip's defs-only island stays collapsed (it renders nothing, only holds a
     * <clipPath> referenced by id). `overflow:visible` keeps any curve/miter
     * overshoot painted; `pointer-events:none` makes the box's transparent area
     * click-through, so it can't swallow clicks meant for shapes behind it (the
     * painted path re-enables hit-testing with its own `pointer-events`).
     */
    const island = (): SVGSVGElement => {
      const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.style.position = 'absolute';
      svg.style.left = '0';
      svg.style.top = '0';
      svg.style.overflow = 'visible';
      svg.style.pointerEvents = 'none';
      return svg;
    };

    list.commands.forEach((cmd, i) => {
      const id = ids[i];
      switch (cmd.op) {
        case 'save': {
          stack.push(cursor);
          scopeStack.push(scope);
          break;
        }
        case 'restore': {
          const saved = stack.pop() ?? this.root;
          // Prune ONLY a child cursor this save/restore actually ENTERED (a
          // transform/clip changed `cursor` to a no-push child). When `cursor`
          // is unchanged from the matching `save` — a node at identity transform
          // emits `save … draw … restore` with no wrapper, so the bracket sits on
          // the SHARED parent — pruning here would wrongly drop later siblings'
          // elements that haven't been re-emitted yet this frame (the structural-
          // transition `insertBefore` crash, faMEQkj0Lk0z). The parent is pruned
          // once, correctly, at end-of-render.
          if (cursor !== saved) this.#pruneCursor(cursor);
          cursor = saved;
          scope = scopeStack.pop() ?? '';
          break;
        }
        case 'transform': {
          const key = this.#keyFor(cursor, id, 'transform');
          const o = this.#matchOrCreate(cursor, key, 'transform', () => {
            const wrap = doc.createElement('div');
            wrap.style.position = 'absolute';
            wrap.style.transformOrigin = '0 0';
            return { op: 'transform', el: wrap, props: {} };
          });
          this.#setStyle(o, o.el as HTMLElement, 'transform', cssMatrix(cmd.m));
          this.#stamp(o, o.el, id);
          cursor = o.el as HTMLElement; // unwound by the enclosing `restore` (no push)
          scope = scope + '/' + key;
          this.#enterCursor(cursor, scope);
          break;
        }
        case 'clip': {
          const key = this.#keyFor(cursor, id, 'clip');
          const defId = 'gsclip_' + hashKey(scope + ' ' + key);
          const o = this.#matchOrCreate(cursor, key, 'clip', () => {
            const svg = island();
            const defs = doc.createElementNS(SVG_NS, 'defs');
            const cp = doc.createElementNS(SVG_NS, 'clipPath');
            cp.setAttribute('clipPathUnits', 'userSpaceOnUse');
            const p = doc.createElementNS(SVG_NS, 'path') as SVGPathElement;
            cp.appendChild(p);
            defs.appendChild(cp);
            svg.appendChild(defs);
            const wrap = doc.createElement('div');
            wrap.style.position = 'absolute';
            wrap.style.left = '0';
            wrap.style.top = '0';
            return { op: 'clip', el: wrap, aux: svg, path: p, props: {} };
          });
          o.defId = defId;
          const p = o.path!;
          const cp = (o.aux as SVGSVGElement).querySelector('clipPath')!;
          this.#setAttr(p, o, 'd', 'd', segsToD(pathSegs(cmd.path)));
          this.#setAttr(p, o, 'clipRule', 'clip-rule', cmd.rule ?? 'nonzero');
          this.#setAttr(cp, o, 'cpId', 'id', defId);
          this.#setStyle(o, o.el as HTMLElement, 'clipPath', `url(#${defId})`);
          this.#stamp(o, o.el, id);
          cursor = o.el as HTMLElement;
          scope = scope + '/' + key;
          this.#enterCursor(cursor, scope);
          break;
        }
        case 'fillPath': {
          const key = this.#keyFor(cursor, id, 'fillPath');
          const o = this.#matchOrCreate(cursor, key, 'fillPath', () => {
            const svg = island();
            const path = doc.createElementNS(SVG_NS, 'path') as SVGPathElement;
            // the island is pointer-events:none; the painted fill re-enables it
            path.style.pointerEvents = 'auto';
            svg.appendChild(path);
            return { op: 'fillPath', el: svg, path, props: {} };
          });
          const path = o.path!;
          const segs = pathSegs(cmd.path);
          this.#setAttr(path, o, 'd', 'd', segsToD(segs));
          this.#setAttr(path, o, 'fill', 'fill', this.#resolvePaint(cmd.paint, o, scope, key));
          this.#sizeIsland(o.el as SVGSVGElement, o, segs, 0);
          this.#stamp(o, path, id);
          break;
        }
        case 'strokePath': {
          const key = this.#keyFor(cursor, id, 'strokePath');
          const o = this.#matchOrCreate(cursor, key, 'strokePath', () => {
            const svg = island();
            const path = doc.createElementNS(SVG_NS, 'path') as SVGPathElement;
            path.style.pointerEvents = 'stroke'; // the painted stroke is the hit-target
            svg.appendChild(path);
            return { op: 'strokePath', el: svg, path, props: {} };
          });
          const path = o.path!;
          const segs = pathSegs(cmd.path);
          this.#setAttr(path, o, 'd', 'd', segsToD(segs));
          this.#setAttr(path, o, 'fill', 'fill', 'none');
          this.#setAttr(path, o, 'stroke', 'stroke', this.#resolvePaint(cmd.paint, o, scope, key));
          this.#applyStroke(path, o, cmd.stroke);
          // pad the box by the stroke width so the box contains the stroke (which
          // straddles the path centerline) and reasonable miter/round joins.
          this.#sizeIsland(o.el as SVGSVGElement, o, segs, cmd.stroke.width);
          this.#stamp(o, path, id);
          break;
        }
        case 'fillText': {
          const key = this.#keyFor(cursor, id, 'fillText');
          const o = this.#matchOrCreate(cursor, key, 'fillText', () => {
            const div = doc.createElement('div');
            div.style.position = 'absolute';
            div.style.whiteSpace = 'pre';
            // line-height:1 removes the line-box leading so the baseline sits a
            // predictable ~ascent (≈0.8em) below the box top (the translateY below).
            div.style.lineHeight = '1';
            return { op: 'fillText', el: div, props: {} };
          });
          const div = o.el as HTMLElement;
          this.#setStyle(o, div, 'left', `${cmd.x}px`);
          this.#setStyle(o, div, 'top', `${cmd.y}px`);
          // Reproduce canvas text positioning with ONE transform. (a) Baseline:
          // canvas `y` is the baseline, CSS `top` is the box top, so lift by the
          // font ascent at line-height:1. 0.84em is empirically the systematic
          // offset (browser-canary pixel-measured DOM-vs-canvas: a single,
          // NOT-per-font ~0.84em — between the font's actualBoundingBoxAscent
          // ~0.719 and fontBoundingBoxAscent ~0.938 — lands the baseline on
          // canvas's, ±~1px). (b) Alignment: canvas `textAlign` anchors the run
          // AROUND `x`, but a shrink-wrapped div is left-anchored at `x` — so shift
          // by the text's OWN width: center → −50%, right → −100%. (CSS
          // `text-align` is a no-op on a shrink-wrapped div, so it must be a
          // translate.)
          const ax = cmd.align === 'center' ? '-50%' : cmd.align === 'right' ? '-100%' : '0px';
          this.#setStyle(o, div, 'transform', `translate(${ax}, -0.84em)`);
          // Set the font via LONGHANDS, not the `font` shorthand: the shorthand
          // resets line-height (clobbering the line-height:1 set at create, which
          // keeps the baseline offset predictable). Longhands leave it alone.
          this.#setStyle(o, div, 'fontFamily', cmd.font.family);
          this.#setStyle(o, div, 'fontSize', `${cmd.font.size}px`);
          this.#setStyle(o, div, 'fontWeight', cmd.font.weight !== undefined ? String(cmd.font.weight) : undefined);
          this.#setStyle(o, div, 'fontStyle', cmd.font.style !== undefined ? cmd.font.style : undefined);
          this.#setStyle(o, div, 'fontVariationSettings',
            cmd.font.fontVariationSettings !== undefined ? cmd.font.fontVariationSettings : undefined);
          this.#setStyle(o, div, 'letterSpacing',
            cmd.font.letterSpacing !== undefined ? `${cmd.font.letterSpacing}px` : undefined);
          this.#setStyle(o, div, 'color', this.#solid(cmd.paint));
          // A non-solid text fill (gradient/mesh) has no CSS text analogue here —
          // flag the approximation so an editor can badge it (design-agent ask).
          this.#setAttr(div, o, 'dataApprox', 'data-approx', cmd.paint.kind !== 'color' ? 'true' : undefined);
          this.#setText(div, o, cmd.text);
          this.#stamp(o, div, id);
          break;
        }
        case 'drawImage': {
          const res: Resource | undefined = list.resources[cmd.image];
          const assetId = res && (res.kind === 'image' || res.kind === 'videoFrame') ? res.assetId : undefined;
          const key = this.#keyFor(cursor, id, 'drawImage');
          const o = this.#matchOrCreate(cursor, key, 'drawImage', () => {
            const img = doc.createElement('img');
            img.style.position = 'absolute';
            img.style.objectFit = 'fill';
            return { op: 'drawImage', el: img, props: {} };
          });
          const img = o.el as HTMLImageElement;
          this.#setStyle(o, img, 'left', `${cmd.dst.x}px`);
          this.#setStyle(o, img, 'top', `${cmd.dst.y}px`);
          this.#setStyle(o, img, 'width', `${cmd.dst.w}px`);
          this.#setStyle(o, img, 'height', `${cmd.dst.h}px`);
          this.#setStyle(o, img, 'imageRendering', cmd.smoothing === false ? 'pixelated' : undefined);
          this.#setAttr(img, o, 'dataAssetId', 'data-asset-id', assetId);
          const src = assetId !== undefined ? this.#imageSrc(assetId) : undefined;
          if (src !== undefined && o.props['src'] !== src) {
            img.src = src;
            o.props['src'] = src;
          }
          this.#stamp(o, img, id);
          break;
        }
        case 'pushGroup': {
          const key = this.#keyFor(cursor, id, 'pushGroup');
          const o = this.#matchOrCreate(cursor, key, 'pushGroup', () => {
            const wrap = doc.createElement('div');
            wrap.style.position = 'absolute';
            wrap.style.left = '0';
            wrap.style.top = '0';
            return { op: 'pushGroup', el: wrap, props: {} };
          });
          const wrap = o.el as HTMLElement;
          this.#setStyle(o, wrap, 'opacity', cmd.opacity !== 1 ? String(cmd.opacity) : undefined);
          const blend = blendToCss(cmd.blend);
          this.#setStyle(o, wrap, 'mixBlendMode', blend !== 'normal' ? blend : undefined);
          this.#setStyle(o, wrap, 'filter', cmd.filters.length > 0 ? filtersToCanvasFilter(cmd.filters) : undefined);
          // cacheKey is IGNORED (no raster cache in a DOM tree — just render).
          if (cmd.shader !== undefined && !this.#warnedShader) {
            emitDevWarning('@glissade/backend-dom: a ShaderEffect (pushGroup.shader) has no DOM analogue — ignored (caps.shaders=false).');
            this.#warnedShader = true;
          }
          this.#stamp(o, wrap, id);
          stack.push(cursor);
          scopeStack.push(scope);
          cursor = wrap;
          scope = scope + '/' + key;
          this.#enterCursor(cursor, scope);
          break;
        }
        case 'popGroup': {
          this.#pruneCursor(cursor);
          cursor = stack.pop() ?? this.root;
          scope = scopeStack.pop() ?? '';
          break;
        }
      }
    });

    // Balanced input (every emitWithIds transform/clip is save/restore-bracketed)
    // ends with cursor === root. A MALFORMED stream (a top-level transform/clip
    // with no enclosing save/restore — never produced by emitWithIds) would leave
    // an open cursor unpruned; drain it (and warn once) so a stale-node leak is a
    // loud signal, not silent. The prune contract assumes emitter bracketing.
    if (cursor !== this.root) {
      if (!this.#warnedUnbalanced) {
        emitDevWarning(
          '@glissade/backend-dom: render() ended with an unbalanced cursor (a transform/clip with no enclosing save/restore) — the DisplayList is malformed; draining open cursors.',
        );
        this.#warnedUnbalanced = true;
      }
      while (cursor !== this.root) {
        this.#pruneCursor(cursor);
        cursor = stack.pop() ?? this.root;
      }
    }
    this.#pruneCursor(this.root);
  }

  measureText(text: string, font: FontSpec): TextMetricsLite {
    const size = font.size;
    const span = this.#ensureMeasureSpan();
    // Re-attach to a live tree if it drifted out (host swapped, body replaced) —
    // a disconnected span measures 0 and silently degrades wrapping to estimate.
    if (!span.isConnected) this.#mountMeasureSpan(span);
    span.style.font = fontString(font);
    span.style.fontVariationSettings = font.fontVariationSettings ?? 'normal';
    span.style.letterSpacing = font.letterSpacing !== undefined ? `${font.letterSpacing}px` : 'normal';
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
    // Intentional full teardown (NOT the retained patch path).
    this.root.replaceChildren();
    if (this.#host && this.root.parentNode === this.#host) this.#host.removeChild(this.root);
    this.#measureSpan?.remove();
    this.#measureSpan = null;
    this.#images.clear();
    this.#videos.clear();
  }

  // ---- reconciler internals ------------------------------------------------

  /** Get-or-create this cursor's recon record; reset per-render scratch once per
   * frame (the first time a reused cursor is entered this render). */
  #enterCursor(cursor: Element, _scope: string): CursorRecon {
    let rec = this.#recon.get(cursor);
    if (!rec) {
      rec = { children: new Map(), owns: new Set(), occ: new Map(), seen: new Set(), frame: -1, anchor: null };
      this.#recon.set(cursor, rec);
    }
    if (rec.frame !== this.#frame) {
      rec.frame = this.#frame;
      rec.occ.clear();
      rec.seen.clear();
      // Anchor at the first OWNED child, SKIPPING leading foreign nodes: an
      // unchanged re-render with a foreign node (host overlay) before an owned,
      // focused element must NOT judge that owned element "out of place" — which
      // would relocate (and blur) it. Ordering is decided among owned siblings.
      rec.anchor = cursor.firstChild;
      while (rec.anchor && !rec.owns.has(rec.anchor)) rec.anchor = rec.anchor.nextSibling;
    }
    return rec;
  }

  /** Sibling-scoped key under one cursor: `(id|∅) op occ`. occ disambiguates a
   * node that emits the same op twice and id-less nodes positionally. */
  #keyFor(cursor: Element, id: string | undefined, op: string): string {
    const rec = this.#recon.get(cursor)!;
    const base = (id ?? '∅') + ' ' + op;
    const n = rec.occ.get(base) ?? 0;
    rec.occ.set(base, n + 1);
    return base + ' ' + n;
  }

  /** Reuse the owned element for `key` under `cursor`, or create it via the
   * factory. Place it (move-on-reorder, foreign-safe). The SOLE creation site. */
  #matchOrCreate(cursor: Element, key: string, op: string, create: () => Owned): Owned {
    const rec = this.#recon.get(cursor)!;
    rec.seen.add(key);
    let el = rec.children.get(key);
    let o: Owned;
    if (!el) {
      o = create();
      el = o.el;
      rec.children.set(key, el);
      rec.owns.add(el);
      if (o.aux) rec.owns.add(o.aux);
      this.#owned.set(el, o);
    } else {
      o = this.#owned.get(el)!;
      if (o.op !== op) {
        // op-shape change under a stable key (rare; editable text targets keep a
        // stable op) — rebuild rather than mis-patch.
        if (o.aux) rec.owns.delete(o.aux);
        rec.owns.delete(el);
        o.aux?.remove();
        el.remove();
        rec.children.delete(key);
        this.#owned.delete(el);
        o = create();
        el = o.el;
        rec.children.set(key, el);
        rec.owns.add(el);
        if (o.aux) rec.owns.add(o.aux);
        this.#owned.set(el, o);
      }
    }
    // PLACEMENT — foreign-safe move-on-reorder. clip's aux island precedes its
    // wrapper as a unit; both step the anchor forward over foreign siblings.
    if (o.aux) this.#place(cursor, rec, o.aux);
    this.#place(cursor, rec, el);
    return o;
  }

  /** Place `node` at the running anchor, moving it only if out of place; then
   * advance the anchor past it and over any interleaved FOREIGN siblings. */
  #place(cursor: Element, rec: CursorRecon, node: Node): void {
    if (node !== rec.anchor) {
      // Belt-and-suspenders: never relocate the node holding focus/caret —
      // re-inserting a connected node blurs it (collapsing an in-progress edit).
      // Leave it; correct sibling order resumes once it is no longer focused.
      // (The anchor skips foreign nodes, so a stable node on an unchanged
      // re-render never reaches here — this guards only a genuine reorder of the
      // focused node, where preserving the edit beats perfect z-order.)
      const ae = this.#doc.activeElement;
      if (ae === null || (node !== ae && !node.contains(ae))) {
        cursor.insertBefore(node, rec.anchor); // moves an existing node or inserts a new one
      }
    }
    rec.anchor = node.nextSibling;
    // Step over foreign nodes (never an insert target, never moved).
    while (rec.anchor && !rec.owns.has(rec.anchor)) {
      rec.anchor = rec.anchor.nextSibling;
    }
  }

  /** Remove owned children of `cursor` not seen this frame. Iterates the
   * children Map ONLY — foreign nodes are not keys, so they are unreachable. */
  #pruneCursor(cursor: Element): void {
    const rec = this.#recon.get(cursor);
    if (!rec) return;
    for (const [k, el] of rec.children) {
      if (!rec.seen.has(k)) {
        const o = this.#owned.get(el);
        if (o?.aux) rec.owns.delete(o.aux);
        rec.owns.delete(el);
        o?.aux?.remove();
        el.remove();
        rec.children.delete(k);
        this.#owned.delete(el);
      }
    }
  }

  // ---- compare-then-write helpers ------------------------------------------

  /** Write a style prop only when it changed; clear (to default) on undefined. */
  #setStyle(o: Owned, target: HTMLElement | SVGElement, prop: string, value: string | undefined): void {
    if (o.props[prop] === value) return;
    const style = target.style as unknown as Record<string, string>;
    style[prop] = value ?? '';
    o.props[prop] = value;
  }

  /** Write an attribute only when its cached slot changed; remove on undefined. */
  #setAttr(target: Element, o: Owned, slot: string, name: string, value: string | undefined): void {
    if (o.props[slot] === value) return;
    if (value === undefined) target.removeAttribute(name);
    else target.setAttribute(name, value);
    o.props[slot] = value;
  }

  /** Stamp `data-node-id` (guarded) on the element S2 stamped per op. */
  #stamp(o: Owned, el: Element, id: string | undefined): void {
    if (id === undefined) return;
    this.#setAttr(el, o, 'nodeId', 'data-node-id', id);
  }

  /**
   * Size a geometry island's `<svg>` box tightly to its path bbox (in the
   * cursor's local space) via the `viewBox`, so the painted coordinates are
   * UNCHANGED (1:1 mapping) while the element box shrinks from full-canvas to the
   * shape. Cached writes — only touches the DOM when the bbox moves. `pad`
   * (stroke width) grows the box so it contains a stroke straddling the
   * centerline; `overflow:visible` covers any residual curve/miter overshoot.
   */
  #sizeIsland(svg: SVGSVGElement, o: Owned, segs: readonly PathSeg[], pad: number): void {
    const bb = pathBBox(segs);
    if (bb === null) {
      this.#setAttr(svg, o, 'svgW', 'width', '0');
      this.#setAttr(svg, o, 'svgH', 'height', '0');
      this.#setAttr(svg, o, 'svgVB', 'viewBox', undefined);
      return;
    }
    const x = bb.x - pad;
    const y = bb.y - pad;
    const w = bb.w + 2 * pad;
    const h = bb.h + 2 * pad;
    this.#setStyle(o, svg, 'left', `${x}px`);
    this.#setStyle(o, svg, 'top', `${y}px`);
    this.#setAttr(svg, o, 'svgW', 'width', String(w));
    this.#setAttr(svg, o, 'svgH', 'height', String(h));
    this.#setAttr(svg, o, 'svgVB', 'viewBox', `${x} ${y} ${w} ${h}`);
  }

  /**
   * Caret-preserving text write. RULE B (freeze): never touch the text while the
   * div (or a descendant) is the focused contentEditable. RULE A (patch-only):
   * write nothing when unchanged; otherwise mutate the SAME Text node's `.data`
   * (least-destructive — never `textContent=` on a retained subtree, which would
   * collapse the caret / drop a selection).
   */
  #setText(div: HTMLElement, o: Owned, text: string): void {
    if (this.#isEditing(div)) return;
    if (o.props['text'] === text) return;
    // Find the MANAGED Text node (not necessarily firstChild — the host may have
    // injected a foreign node before it) and mutate its `.data` in place. NEVER
    // `textContent=` — it wipes the whole subtree, including a foreign sibling.
    let tn: Text | null = null;
    for (let n = div.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        tn = n as Text;
        break;
      }
    }
    if (tn) tn.data = text;
    else div.appendChild(this.#doc.createTextNode(text)); // first build — append, don't replace
    o.props['text'] = text;
  }

  /** The div (or a descendant) is the focused contentEditable host. Uses the
   * computed `isContentEditable` (real browsers) with an attribute fallback
   * (jsdom and other environments that don't compute it). */
  #isEditing(div: HTMLElement): boolean {
    const editable = div.isContentEditable || div.getAttribute('contenteditable') === 'true';
    if (!editable) return false;
    const active = this.#doc.activeElement;
    return active === div || (active !== null && active !== this.#doc.body && div.contains(active));
  }

  /** Map a `StrokeStyle` onto an SVG `<path>`'s stroke-* attributes (guarded). */
  #applyStroke(path: SVGPathElement, o: Owned, stroke: StrokeStyle): void {
    this.#setAttr(path, o, 'strokeWidth', 'stroke-width', String(stroke.width));
    this.#setAttr(path, o, 'strokeCap', 'stroke-linecap', stroke.cap);
    this.#setAttr(path, o, 'strokeJoin', 'stroke-linejoin', stroke.join);
    this.#setAttr(path, o, 'strokeMiter', 'stroke-miterlimit',
      stroke.miterLimit !== undefined ? String(stroke.miterLimit) : undefined);
    this.#setAttr(path, o, 'strokeDash', 'stroke-dasharray',
      stroke.dash && stroke.dash.length > 0 ? stroke.dash.join(' ') : undefined);
    this.#setAttr(path, o, 'strokeDashOff', 'stroke-dashoffset',
      stroke.dashOffset !== undefined ? String(stroke.dashOffset) : undefined);
  }

  // ---- other internals -----------------------------------------------------

  #ensureMeasureSpan(): HTMLElement {
    if (this.#measureSpan) return this.#measureSpan;
    const span = this.#doc.createElement('span');
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    span.style.whiteSpace = 'pre';
    span.style.left = '-99999px';
    span.style.top = '0';
    this.#measureSpan = span;
    this.#mountMeasureSpan(span);
    return span;
  }

  /**
   * Attach the measuring span to a CONNECTED layout tree. A detached element
   * reports a 0-width rect in real browsers too — so a measurer mounted under a
   * not-yet-connected host silently falls back to the coarse estimate, mis-breaks
   * long Text, and captions overflow their `width` (aJsLQp0fSs5L). Prefer the
   * document body (reliably live), then a connected host, else the root (headless
   * jsdom has no layout anyway → 0 → estimate, which is expected there).
   */
  #mountMeasureSpan(span: HTMLElement): void {
    const body = this.#doc.body;
    const mount = (body && body.isConnected !== false ? body : null) ?? (this.#host?.isConnected ? this.#host : null) ?? this.root;
    mount.appendChild(span);
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

  /** A signature of the gradient paint — a `<defs>` subtree is rebuilt only when
   * this changes (kind / coords / stops), avoiding per-frame churn. */
  #gradKey(paint: Extract<Paint, { kind: 'linear' | 'radial' }>): string {
    const coords = paint.kind === 'linear'
      ? `L|${paint.from ?? ''}|${paint.to ?? ''}`
      : `R|${paint.center ?? ''}|${paint.radius ?? ''}`;
    const stops = paint.stops.map((s) => `${s.offset}:${s.color}`).join(',');
    return `${coords}|${stops}`;
  }

  /** Resolve a `Paint` to an SVG fill/stroke value, building/refreshing the
   * gradient `<defs>` on the owned svg (`o.el`) keyed by a deterministic def id.
   * `mesh` degrades to a solid; a degraded paint stamps `data-approx="true"`. */
  #resolvePaint(paint: Paint, o: Owned, scope: string, key: string): string {
    if (paint.kind === 'color') {
      this.#setAttr(o.path!, o, 'dataApprox', 'data-approx', undefined);
      // A prior gradient def (if the paint changed kind) is left in defs but
      // unreferenced; harmless in this preview tier.
      return paint.color;
    }
    if (paint.kind === 'mesh') {
      this.#setAttr(o.path!, o, 'dataApprox', 'data-approx', 'true');
      if (!this.#warnedMesh) {
        emitDevWarning('@glissade/backend-dom: mesh-gradient paint has no SVG analogue — degraded to a solid fill.');
        this.#warnedMesh = true;
      }
      return this.#solid(paint);
    }
    if (paint.interpolation !== undefined && paint.interpolation !== 'linear') {
      this.#setAttr(o.path!, o, 'dataApprox', 'data-approx', 'true');
      if (!this.#warnedGradientInterp) {
        emitDevWarning(
          `@glissade/backend-dom: gradient interpolation '${paint.interpolation}' has no SVG analogue — degraded to linear stops.`,
        );
        this.#warnedGradientInterp = true;
      }
    } else {
      this.#setAttr(o.path!, o, 'dataApprox', 'data-approx', undefined);
    }
    const svg = o.el as SVGSVGElement;
    const defId = o.defId ?? (o.defId = 'gsgrad_' + hashKey(scope + ' ' + key));
    const sig = this.#gradKey(paint);
    if (o.gradKey !== sig) {
      o.gradKey = sig;
      this.#buildGradient(svg, defId, paint);
    }
    return `url(#${defId})`;
  }

  /** (Re)build the gradient `<defs>` subtree for `defId` on `svg`. */
  #buildGradient(svg: SVGSVGElement, defId: string, paint: Extract<Paint, { kind: 'linear' | 'radial' }>): void {
    const doc = this.#doc;
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = doc.createElementNS(SVG_NS, 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    // Replace just this gradient (by our deterministic, CSS-safe id), leaving any
    // other defs untouched. (defId is `gs(grad|clip)_<base36 hash>` — no escape.)
    for (const g of Array.from(defs.children)) {
      if (g.getAttribute('id') === defId) g.remove();
    }
    const grad = doc.createElementNS(SVG_NS, paint.kind === 'radial' ? 'radialGradient' : 'linearGradient');
    grad.setAttribute('id', defId);
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
  }
}

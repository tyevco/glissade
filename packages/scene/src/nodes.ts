/**
 * Built-in nodes for M1 (DESIGN.md §3.1): Group, Rect, Circle, Text.
 * Path/Image/Video/Layout arrive with their milestones.
 */

import { emitDevWarning, random, signal, type BindableSignal, type PathContour, type PathValue, type Track, type Vec2 } from '@glissade/core';
import { type DisplayListBuilder, type FontSpec, type Paint, type PathSeg, type StrokeStyle } from './displayList.js';
import {
  arcLength,
  flatten,
  hachureLines,
  hashStr,
  roughen,
  validateHachure,
  validateSketch,
  type HachureSpec,
  type SketchStyle,
} from './sketch.js';
import { Node, type EvalContext, type NodeProps, type PropInit } from './node.js';
import {
  breakLines,
  fallbackMeasurer,
  quantize,
  segmentGraphemes,
  segmentWords,
  warnIfEstimating,
  type TextMeasurer,
} from './text.js';

/**
 * The NAMED extension point of the closed §3.1 taxonomy: the documented base
 * an author subclasses to emit IR commands (never canvas calls). It adds
 * nothing to `Node` — it exists so "custom-via-subclassing" is a real,
 * exported surface (the ninth taxonomy member) rather than an unnamed
 * convention. Subclasses implement the abstract `draw()` from `Node`.
 */
export abstract class Custom extends Node {}

/** Rounded-rect path segments — Rect's outline, shared with Highlight. */
export function roundedRectSegs(x: number, y: number, w: number, h: number, r: number): PathSeg[] {
  if (r <= 0) {
    return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
  }
  const HALF = Math.PI / 2;
  // canvas ellipse() draws a connecting line from the current point, so
  // each quarter arc continues the outline
  return [
    ['M', x + r, y],
    ['L', x + w - r, y],
    ['E', x + w - r, y + r, r, r, 0, -HALF, 0],
    ['L', x + w, y + h - r],
    ['E', x + w - r, y + h - r, r, r, 0, 0, HALF],
    ['L', x + r, y + h],
    ['E', x + r, y + h - r, r, r, 0, HALF, Math.PI],
    ['L', x, y + r],
    ['E', x + r, y + r, r, r, 0, Math.PI, Math.PI + HALF],
    ['Z'],
  ];
}

export class Group extends Node {
  /**
   * Taxonomy name pinned as a STRING LITERAL (not the inherited
   * `constructor.name`): the minified `@glissade/browser` IIFE mangles class
   * names, so the base `Node.describeType` getter returns a garbled name in the
   * bundle — which silently breaks the bind-guard's construction-prop message
   * (`scene.ts` keys `isConstructionProp(node.describeType, …)` on it, so a
   * mangled name falls through to the generic "no signal resolves" error).
   * Every built-in node pins it literally; `ImageNode` already did. Render-neutral
   * (describeType is read only on the error path + by `describe()`).
   */
  override get describeType(): string {
    return 'Group';
  }
  readonly children: Node[];
  /** Version bumped on structural child mutation, so a dependency-tracked memo
   * (e.g. Layout's computed) re-runs when the child SET changes — not only when
   * a participating prop signal does. */
  readonly #structure = signal(0);

  constructor(props: NodeProps & { children?: Node[] } = {}) {
    super(props);
    this.children = props.children ?? [];
    for (const child of this.children) child.parent = this;
    // Validate ONLY a plain Group — subclasses (Layout) run their own check with
    // their fuller target set; see Node.checkProps.
    if (new.target === Group) this.checkProps(props);
  }

  /** Record the structural version as a dependency — call inside a computed
   * that walks `children` so add()/remove() invalidate it. */
  protected trackStructure(): void {
    this.#structure();
  }

  add(child: Node): this {
    child.parent = this;
    this.children.push(child);
    this.#structure.set(this.#structure.peek() + 1);
    return this;
  }

  /** Remove a child (the reactive counterpart to add()); no-op if absent. */
  remove(child: Node): this {
    const i = this.children.indexOf(child);
    if (i >= 0) {
      this.children.splice(i, 1);
      if (child.parent === this) child.parent = null;
      this.#structure.set(this.#structure.peek() + 1);
    }
    return this;
  }

  protected draw(out: DisplayListBuilder, ctx: EvalContext): void {
    // Paint order: child-array order, locally reordered by zIndex (stable, §3.1)
    const sorted = this.children
      .map((node, i) => ({ node, i }))
      .sort((a, b) => a.node.zIndex() - b.node.zIndex() || a.i - b.i)
      .map((e) => e.node);
    for (const child of sorted) child.emit(out, ctx);
  }
}

/** A color string is sugar for a solid `color` Paint; a Paint passes through. */
export function toPaint(fill: string | Paint): Paint {
  return typeof fill === 'string' ? { kind: 'color', color: fill } : fill;
}

export interface ShapeProps extends NodeProps {
  /** A CSS color string, or a `Paint` (e.g. a `radial` gradient — soft-light
   * fills with no blur filter; center/radius default to the shape bounds). */
  fill?: PropInit<string | Paint>;
  stroke?: PropInit<string>;
  strokeWidth?: PropInit<number>;
  /** hand-drawn look: the outline is geometrically roughened (see sketch.ts) */
  sketch?: SketchStyle;
  /** seed for the roughening; default a stable hash of the node id */
  sketchSeed?: number;
  /** draw-on for a sketched shape: 0..1 of the outline drawn (default 1 = whole).
   * Track `<id>/reveal`. Precise for single-contour shapes; multi-contour ones
   * reveal each contour in parallel. */
  reveal?: PropInit<number>;
  /** sketchy hatch fill clipped to the shape (the pencil/crayon filled look);
   * requires `sketch`. */
  sketchFill?: HachureSpec;
}

abstract class Shape extends Node {
  readonly fill: BindableSignal<string | Paint>;
  readonly stroke: BindableSignal<string>;
  readonly strokeWidth: BindableSignal<number>;
  readonly sketch: SketchStyle | undefined;
  readonly sketchFill: HachureSpec | undefined;
  readonly sketchSeed: number;
  readonly reveal: BindableSignal<number>;

  constructor(props: ShapeProps = {}) {
    super(props);
    this.fill = initProp(signal<string | Paint>(''), props.fill);
    this.stroke = initProp(signal(''), props.stroke);
    this.strokeWidth = initProp(signal(0), props.strokeWidth);
    this.reveal = initProp(signal(1), props.reveal);
    // fill is polymorphic: a solid color string ('color') OR a Paint object ('paint').
    this.registerTarget('fill', this.fill, ['color', 'paint']);
    this.registerTarget('stroke', this.stroke, 'color');
    this.registerTarget('strokeWidth', this.strokeWidth, 'number');
    this.registerTarget('reveal', this.reveal, 'number');
    if (props.sketch) validateSketch(props.sketch);
    if (props.sketchFill) validateHachure(props.sketchFill);
    if (props.sketchFill && !props.sketch) {
      emitDevWarning(
        `${this.id !== undefined ? `'${this.id}': ` : ''}sketchFill is ignored without sketch — hachure fill is drawn only by the sketch renderer. Set a sketch style (e.g. { kind: 'pencil' }) to see it.`,
      );
    }
    this.sketch = props.sketch;
    this.sketchFill = props.sketchFill;
    this.sketchSeed = props.sketchSeed ?? (this.id !== undefined ? hashStr(this.id) : 0);
  }

  protected abstract pathSegs(): PathSeg[];

  protected draw(out: DisplayListBuilder): void {
    const segs = this.pathSegs();
    if (this.sketch) return this.drawSketch(out, segs);
    const path = out.resource({ kind: 'path', segs });
    const fill = this.fill();
    if (fill) out.push({ op: 'fillPath', path, paint: toPaint(fill) });
    const stroke = this.stroke();
    const width = this.strokeWidth();
    if (stroke && width > 0) {
      const reveal = this.reveal();
      if (reveal < 1) {
        // draw-on for ANY stroked shape (not just sketched) — reveal>=1 keeps
        // the single strokePath below, so existing goldens are byte-identical
        emitDrawOnStroke(out, segs, { kind: 'color', color: stroke }, { width }, reveal);
      } else {
        out.push({ op: 'strokePath', path, paint: { kind: 'color', color: stroke }, stroke: { width } });
      }
    }
  }

  /** Hand-drawn render: solid fill (if any) under roughened, multi-pass strokes.
   * The seed is consumed fresh each draw, so re-evaluation is byte-identical. */
  private drawSketch(out: DisplayListBuilder, segs: PathSeg[]): void {
    const rng = random(this.sketchSeed >>> 0);
    const fill = this.fill();
    if (fill) {
      const path = out.resource({ kind: 'path', segs });
      out.push({ op: 'fillPath', path, paint: toPaint(fill) });
    }
    const { strokes, resolved } = roughen(segs, this.sketch!, rng);
    // ink (the sketch outline color) must be a string; a gradient fill can't be one
    const ink = this.stroke() || (typeof fill === 'string' ? fill : '') || '#000000';
    // hatch fill, clipped to the shape, UNDER the roughened outline. The rng is
    // consumed AFTER roughen (stable order) so the result stays byte-identical.
    if (this.sketchFill) {
      const clipPath = out.resource({ kind: 'path', segs });
      out.push({ op: 'save' });
      out.push({ op: 'clip', path: clipPath, rule: 'nonzero' });
      const hatch = hachureLines(segs, this.sketchFill, rng);
      if (hatch.length > 0) {
        const hp = out.resource({ kind: 'path', segs: hatch });
        out.push({ op: 'strokePath', path: hp, paint: { kind: 'color', color: ink }, stroke: { width: Math.max(1, resolved.width * 0.5), cap: 'round' } });
      }
      out.push({ op: 'restore' });
    }
    const reveal = this.reveal();
    const drawOn = reveal < 1; // strict: reveal >= 1 takes the byte-identical path
    for (const passSegs of strokes) {
      if (passSegs.length === 0) continue;
      if (drawOn) {
        emitDrawOnStroke(out, passSegs, { kind: 'color', color: ink }, { width: resolved.width, cap: 'round', join: 'round' }, reveal);
        continue;
      }
      const path = out.resource({ kind: 'path', segs: passSegs });
      out.push({
        op: 'strokePath',
        path,
        paint: { kind: 'color', color: ink },
        stroke: { width: resolved.width, cap: 'round', join: 'round', ...(resolved.dash ? { dash: resolved.dash } : {}) },
      });
    }
  }
}

function initProp<T>(sig: BindableSignal<T>, init: PropInit<T> | undefined): BindableSignal<T> {
  if (typeof init === 'function') sig.bindSource(init as () => T);
  else if (init !== undefined) sig.set(init);
  return sig;
}

/** Split a stroke path into its subpaths (each starting at an 'M'). */
function splitContours(segs: PathSeg[]): PathSeg[][] {
  const out: PathSeg[][] = [];
  let cur: PathSeg[] | null = null;
  for (const s of segs) {
    if (s[0] === 'M') {
      cur = [s];
      out.push(cur);
    } else if (cur) {
      cur.push(s);
    }
  }
  return out;
}

/**
 * Emit a stroke that "draws on" by arc length — a retreating dash PER CONTOUR
 * (canvas restarts the dash phase at each subpath move, so each contour reveals
 * from its own start). Shared by sketched and plain stroked shapes.
 */
function emitDrawOnStroke(
  out: DisplayListBuilder,
  segs: PathSeg[],
  paint: Paint,
  baseStroke: StrokeStyle,
  reveal: number,
): void {
  for (const contour of splitContours(segs)) {
    const len = flatten(contour).reduce((s, p) => s + arcLength(p), 0);
    const path = out.resource({ kind: 'path', segs: contour });
    out.push({ op: 'strokePath', path, paint, stroke: { ...baseStroke, dash: [len, len], dashOffset: len * (1 - reveal) } });
  }
}

/**
 * Coerce a `Path.data` init to a `PathValue`: an array of contour objects
 * passes through; anything else (a string, a number, …) is a construction-time
 * error. SVG `d` strings are NOT parsed here — that parser lives on the
 * tree-shakeable `@glissade/scene/path` subpath (kept off the base embed), so a
 * string `data` throws a clear error pointing at `pathFromSvg(d)`. Returns `[]`
 * for `undefined` (the empty-path default).
 *
 * Note on the two surfaces (both accept `PathValue`, both reject raw `d`
 * strings — only the rejection LAYER differs, by design): the construction prop
 * `data` is coerced HERE at `new Path({ data })` time; the animatable target
 * `<id>/d` (the same underlying signal) is a `'path'`-typed track validated at
 * bind time by core's value-type guard. So a string passed to `data` throws
 * this construction-time `TypeError`, while a string track VALUE on `d` is
 * rejected at `bindScene` — same outcome (use `pathFromSvg` for SVG strings),
 * different layer/wording.
 */
export function coercePathData(data: unknown): PathValue {
  if (data === undefined) return [];
  if (Array.isArray(data)) {
    const ok = data.every(
      (c) =>
        typeof c === 'object' && c !== null &&
        Array.isArray((c as PathContour).v) &&
        Array.isArray((c as PathContour).in) &&
        Array.isArray((c as PathContour).out),
    );
    if (ok) return data as PathValue;
  }
  throw new TypeError(
    `Path.data expects PathValue (PathContour[]); for an SVG path 'd' string, parse it with pathFromSvg(d) from "@glissade/scene/path" (or window.glissade.pathFromSvg in the browser bundle)`,
  );
}

/**
 * `PathSeg[]` → `PathValue` (Lottie vertex contours) — the inverse of
 * `Path.pathSegs`, so geometry from `roundedRectSegs` / `sketchStrokes` /
 * `flatten` can be placed on a `Path` node (to morph, motion-path, or draw-on
 * it). C/Q become an anchor + relative in/out tangents; L is a zero-tangent
 * vertex; E samples to vertices; Z closes the contour, folding the closing
 * tangent back onto the first vertex. Round-trips C-contours exactly.
 */
export function pathFromSegs(segs: readonly PathSeg[]): PathValue {
  type Contour = { closed: boolean; v: Vec2[]; in: Vec2[]; out: Vec2[] };
  const contours: Contour[] = [];
  let c: Contour | null = null;
  const push = (v: Vec2, inT: Vec2 = [0, 0], outT: Vec2 = [0, 0]): void => {
    c!.v.push(v);
    c!.in.push(inT);
    c!.out.push(outT);
  };
  const last = (): Vec2 => c!.v[c!.v.length - 1]!;
  for (const s of segs) {
    switch (s[0]) {
      case 'M':
        c = { closed: false, v: [[s[1], s[2]]], in: [[0, 0]], out: [[0, 0]] };
        contours.push(c);
        break;
      case 'L':
        if (c) push([s[1], s[2]]);
        break;
      case 'C':
        if (c) {
          const p0 = last();
          c.out[c.out.length - 1] = [s[1] - p0[0], s[2] - p0[1]]; // out of prev = c1 − p0
          push([s[5], s[6]], [s[3] - s[5], s[4] - s[6]]); // in of new = c2 − p1
        }
        break;
      case 'Q':
        if (c) {
          const p0 = last();
          const qx = s[1];
          const qy = s[2];
          const px = s[3];
          const py = s[4];
          c.out[c.out.length - 1] = [(2 / 3) * (qx - p0[0]), (2 / 3) * (qy - p0[1])];
          push([px, py], [(2 / 3) * (qx - px), (2 / 3) * (qy - py)]);
        }
        break;
      case 'E':
        if (c) {
          const [, cx, cy, rx, ry, rot, a0, a1] = s;
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          for (let k = 1; k <= 16; k++) {
            const ang = a0 + (a1 - a0) * (k / 16);
            const ex = rx * Math.cos(ang);
            const ey = ry * Math.sin(ang);
            push([cx + ex * cos - ey * sin, cy + ex * sin + ey * cos]);
          }
        }
        break;
      case 'Z':
        if (c) {
          c.closed = true;
          const f = c.v[0]!;
          const l = last();
          if (c.v.length > 1 && Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) {
            c.in[0] = c.in[c.in.length - 1]!; // fold the closing in-tangent onto v0
            c.v.pop();
            c.in.pop();
            c.out.pop();
          }
        }
        break;
    }
  }
  return contours;
}

export class Rect extends Shape {
  /** Taxonomy name pinned literally (survives IIFE minification — see {@link Group}). */
  override get describeType(): string {
    return 'Rect';
  }
  readonly width: BindableSignal<number>;
  readonly height: BindableSignal<number>;
  /** Corner radius; clamped to half the smaller dimension. radius = h/2 makes a pill. */
  readonly cornerRadius: BindableSignal<number>;

  constructor(
    props: ShapeProps & {
      width?: PropInit<number>;
      height?: PropInit<number>;
      cornerRadius?: PropInit<number>;
    } = {},
  ) {
    super(props);
    this.width = initProp(signal(0), props.width);
    this.height = initProp(signal(0), props.height);
    this.cornerRadius = initProp(signal(0), props.cornerRadius);
    this.registerTarget('width', this.width, 'number');
    this.registerTarget('height', this.height, 'number');
    this.registerTarget('cornerRadius', this.cornerRadius, 'number');
    if (new.target === Rect) this.checkProps(props);
  }

  override intrinsicSize(): { w: number; h: number } {
    return { w: this.width(), h: this.height() };
  }

  // centered at the node origin (Motion Canvas convention)
  protected pathSegs(): PathSeg[] {
    const w = this.width();
    const h = this.height();
    const r = Math.min(Math.max(0, this.cornerRadius()), w / 2, h / 2);
    return roundedRectSegs(-w / 2, -h / 2, w, h, r);
  }
}

export class Circle extends Shape {
  /** Taxonomy name pinned literally (survives IIFE minification — see {@link Group}). */
  override get describeType(): string {
    return 'Circle';
  }
  readonly radius: BindableSignal<number>;

  constructor(props: ShapeProps & { radius?: PropInit<number> } = {}) {
    super(props);
    this.radius = initProp(signal(0), props.radius);
    this.registerTarget('radius', this.radius, 'number');
    if (new.target === Circle) this.checkProps(props);
  }

  override intrinsicSize(): { w: number; h: number } {
    const d = this.radius() * 2;
    return { w: d, h: d };
  }

  protected pathSegs(): PathSeg[] {
    const r = this.radius();
    return [['E', 0, 0, r, r, 0, 0, Math.PI * 2], ['Z']];
  }
}

export interface PathProps extends ShapeProps {
  /**
   * The geometry (§2.2 'path' value): bezier contours in vertex form,
   * animatable via a track on '<id>/d'. Accepts a `PathValue` directly or a
   * computed `() => PathValue`. For an SVG `d` STRING, parse it first with
   * `pathFromSvg(d)` from the tree-shakeable `@glissade/scene/path` subpath
   * (off the base embed) — passing a bare string throws a clear construction
   * error rather than dragging the parser onto every embed.
   */
  data?: PropInit<PathValue> | string;
}

/**
 * Arbitrary bezier geometry — the Lottie-import landing spot and the target
 * of native path morphs. Coordinates are node-local (the node origin is
 * wherever the author put 0,0); flow placement uses the control-point bounds.
 */
export class Path extends Shape {
  /** Taxonomy name pinned literally (survives IIFE minification — see {@link Group}). */
  override get describeType(): string {
    return 'Path';
  }
  readonly data: BindableSignal<PathValue>;

  constructor(props: PathProps = {}) {
    super(props);
    // Coerce a constant init (SVG `d` string OR PathValue) at construction; a
    // function init stays a bind source but its produced value is coerced too.
    const init = props.data;
    const coerced: PropInit<PathValue> | undefined =
      typeof init === 'function'
        ? (): PathValue => coercePathData((init as () => unknown)())
        : init !== undefined
          ? coercePathData(init)
          : undefined;
    this.data = initProp(signal<PathValue>([]), coerced);
    this.registerTarget('d', this.data, 'path');
    if (new.target === Path) this.checkProps(props);
  }

  /** Control-point bounding box (conservative: contains the true curve). */
  bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of this.data()) {
      for (let i = 0; i < c.v.length; i++) {
        const vx = c.v[i]![0];
        const vy = c.v[i]![1];
        const candidates = [
          [vx, vy],
          [vx + c.in[i]![0], vy + c.in[i]![1]],
          [vx + c.out[i]![0], vy + c.out[i]![1]],
        ];
        for (const p of candidates) {
          if (p[0]! < minX) minX = p[0]!;
          if (p[1]! < minY) minY = p[1]!;
          if (p[0]! > maxX) maxX = p[0]!;
          if (p[1]! > maxY) maxY = p[1]!;
        }
      }
    }
    if (minX > maxX) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
  }

  override intrinsicSize(): { w: number; h: number } {
    const b = this.bounds();
    return { w: b.maxX - b.minX, h: b.maxY - b.minY };
  }

  /** Geometry is node-local, not center-anchored: offset to the box's actual top-left. */
  override drawOffset(): { x: number; y: number } {
    const b = this.bounds();
    return { x: b.minX, y: b.minY };
  }

  protected pathSegs(): PathSeg[] {
    const segs: PathSeg[] = [];
    for (const c of this.data()) {
      const n = c.v.length;
      if (n === 0) continue;
      segs.push(['M', c.v[0]![0], c.v[0]![1]]);
      for (let i = 0; i < n - 1; i++) {
        segs.push([
          'C',
          c.v[i]![0] + c.out[i]![0],
          c.v[i]![1] + c.out[i]![1],
          c.v[i + 1]![0] + c.in[i + 1]![0],
          c.v[i + 1]![1] + c.in[i + 1]![1],
          c.v[i + 1]![0],
          c.v[i + 1]![1],
        ]);
      }
      if (c.closed && n > 1) {
        segs.push([
          'C',
          c.v[n - 1]![0] + c.out[n - 1]![0],
          c.v[n - 1]![1] + c.out[n - 1]![1],
          c.v[0]![0] + c.in[0]![0],
          c.v[0]![1] + c.in[0]![1],
          c.v[0]![0],
          c.v[0]![1],
        ]);
        segs.push(['Z']);
      }
    }
    return segs;
  }
}

export interface ImageProps extends NodeProps {
  /** Asset id from the Timeline manifest (§2.3). */
  assetId: string;
  width?: PropInit<number>;
  height?: PropInit<number>;
}

export class ImageNode extends Node {
  /** Marks this node as referencing a kind 'image' timeline asset (§2.3). */
  static readonly assetKind = 'image' as const;
  /** Public taxonomy name is `Image` (the class is `ImageNode`). */
  override get describeType(): string {
    return 'Image';
  }
  readonly assetId: string;
  readonly width: BindableSignal<number>;
  readonly height: BindableSignal<number>;

  constructor(props: ImageProps) {
    super(props);
    this.assetId = props.assetId;
    this.width = initProp(signal(0), props.width);
    this.height = initProp(signal(0), props.height);
    this.registerTarget('width', this.width, 'number');
    this.registerTarget('height', this.height, 'number');
    if (new.target === ImageNode) this.checkProps(props);
  }

  override intrinsicSize(): { w: number; h: number } {
    return { w: this.width(), h: this.height() };
  }

  protected draw(out: DisplayListBuilder): void {
    const w = this.width();
    const h = this.height();
    if (w <= 0 || h <= 0) return;
    const image = out.resource({ kind: 'image', assetId: this.assetId });
    out.push({ op: 'drawImage', image, dst: { x: -w / 2, y: -h / 2, w, h } });
  }
}

export interface VideoProps extends NodeProps {
  /** Asset id from the Timeline manifest (kind 'video'). */
  assetId: string;
  /** Timeline second at which the clip starts (§3.8). */
  at?: number;
  /** Seconds into the source where playback begins. */
  trimStart?: number;
  playbackRate?: number;
  /** Clip length on the timeline (seconds); defaults to rest-of-source. */
  clipDuration?: number;
  /**
   * Source frame rate; when set, mediaT is quantized to the source grid in
   * the IR itself (§3.8) so equal-frame times emit identical DisplayLists.
   * Unset: backends quantize at resolve time (pixels identical, IR not).
   */
  sourceFps?: number;
  width?: PropInit<number>;
  height?: PropInit<number>;
}

/**
 * Pure given a warmed VideoFrameSource (§3.8): emit() does only the
 * frame-indexed media-time arithmetic — mediaT = trimStart + (t - at) * rate —
 * and references the exact source-grid frame; backends resolve it.
 */
export class Video extends Node {
  /** Marks this node as referencing a kind 'video' timeline asset (§3.8). */
  static readonly assetKind = 'video' as const;
  /** Taxonomy name pinned literally (survives IIFE minification — see {@link Group}). */
  override get describeType(): string {
    return 'Video';
  }
  readonly assetId: string;
  readonly at: number;
  readonly trimStart: number;
  readonly playbackRate: number;
  readonly clipDuration: number | undefined;
  readonly sourceFps: number | undefined;
  readonly width: BindableSignal<number>;
  readonly height: BindableSignal<number>;

  constructor(props: VideoProps) {
    super(props);
    this.assetId = props.assetId;
    this.at = props.at ?? 0;
    this.trimStart = props.trimStart ?? 0;
    this.playbackRate = props.playbackRate ?? 1;
    this.clipDuration = props.clipDuration;
    this.sourceFps = props.sourceFps;
    this.width = initProp(signal(0), props.width);
    this.height = initProp(signal(0), props.height);
    this.registerTarget('width', this.width, 'number');
    this.registerTarget('height', this.height, 'number');
    if (new.target === Video) this.checkProps(props);
  }

  /** Frame-indexed media time for timeline time t; null when outside the clip. */
  mediaTime(t: number): number | null {
    const local = (t - this.at) * this.playbackRate;
    if (local < 0) return null;
    if (this.clipDuration !== undefined && t - this.at >= this.clipDuration) return null;
    const mediaT = this.trimStart + local;
    if (this.sourceFps !== undefined) {
      return Math.floor(mediaT * this.sourceFps + 1e-9) / this.sourceFps;
    }
    return mediaT;
  }

  protected draw(out: DisplayListBuilder, ctx: EvalContext): void {
    const mediaT = this.mediaTime(ctx.time);
    if (mediaT === null) return;
    const w = this.width();
    const h = this.height();
    if (w <= 0 || h <= 0) return;
    const image = out.resource({ kind: 'videoFrame', assetId: this.assetId, mediaT });
    out.push({ op: 'drawImage', image, dst: { x: -w / 2, y: -h / 2, w, h } });
  }
}

/** One laid-out line's ink box, in the Text node's draw space. */
export interface LineBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One word's ink box within a laid-out line, in the Text node's draw space. */
export interface WordBox {
  text: string;
  /** laid-out line index (blank lines keep their slot in the numbering) */
  line: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One grapheme's ink box within a laid-out line, in the Text node's draw space
 * — the per-grapheme analogue of {@link WordBox}, boxing the SAME grapheme
 * units `reveal`/`graphemes()` count. Whitespace graphemes advance but have no
 * box (dropped), exactly as `wordBoxes()` trims whitespace advance.
 */
export interface GraphemeBox {
  text: string;
  /** laid-out line index (blank lines keep their slot in the numbering) */
  line: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextProps extends NodeProps {
  text?: PropInit<string>;
  fill?: PropInit<string>;
  fontFamily?: string;
  fontSize?: PropInit<number>;
  fontWeight?: number;
  /** Font style; default 'normal'. Threaded into FontSpec.style (§3.6). */
  fontStyle?: 'normal' | 'italic';
  /**
   * Variable-font axis settings in CSS `font-variation-settings` form
   * (e.g. `'"wght" 700, "opsz" 14'`). 0.20 STATIC passthrough: threaded into
   * `FontSpec` and applied by the rasterizer where the context supports it —
   * the Skia/export path (`@napi-rs/canvas` exposes a settable
   * `ctx.fontVariationSettings`) renders the axes; the browser DOM 2D context
   * has no such property, so axes are best-effort there (a guarded no-op, never
   * a throw). OMITTED when unset, so default Text emits a byte-identical
   * FontSpec. Axes are STATIC only in 0.20 — **animatable** axes (a `wght`
   * track, `opsz` driven by size, …) are deferred to 1.0 (an opaque CSS string
   * isn't lerp-able); a track targeting `<id>/fontVariationSettings` hard-throws
   * `UnboundTargetError` today (no property signal resolves to it). For a
   * dynamic weight, use the discrete `fontWeight` named instances your font
   * ships.
   */
  fontVariationSettings?: string;
  /** Horizontal alignment about the node position; default 'left'. */
  align?: 'left' | 'center' | 'right';
  /** Wrap width in px; unset = no wrapping (explicit \n still breaks). */
  width?: PropInit<number>;
  /** Line height as a multiple of fontSize; default 1.25. */
  lineHeight?: number;
  /**
   * Typewriter reveal: how many graphemes of the laid-out text are shown,
   * left-to-right. Default Infinity = fully shown (byte-identical to no
   * reveal, so existing goldens never shift). Track target '<id>/reveal';
   * author a per-keystroke staircase off graphemes() — see revealSchedule().
   */
  reveal?: PropInit<number>;
  /**
   * Typewriter reveal expressed as a FRACTION of the grapheme stream, in
   * [0, 1] — pure count-rounding sugar over {@link reveal}: it resolves against
   * the SAME laid-out grapheme stream to `count = round(fraction * graphemes)`
   * and feeds the identical masked-emit path. `1` = fully shown, `0` = hidden,
   * `0.5` on a 10-grapheme string == `reveal: 5`. When set (the signal is not
   * NaN) it OVERRIDES `reveal`; left unset (the default) the node is
   * byte-identical to one without it. Animatable — track target
   * '<id>/revealFraction'. The sub-grapheme clip-wipe is intentionally out of
   * scope (the unit stays whole graphemes; no partial-grapheme softness).
   */
  revealFraction?: PropInit<number>;
}

export class Text extends Node {
  /** Taxonomy name pinned literally (survives IIFE minification — see {@link Group}). */
  override get describeType(): string {
    return 'Text';
  }
  readonly text: BindableSignal<string>;
  readonly fill: BindableSignal<string>;
  readonly fontSize: BindableSignal<number>;
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontStyle: 'normal' | 'italic';
  /** Static variable-font axes (CSS `font-variation-settings`); undefined = none. */
  readonly fontVariationSettings: string | undefined;
  readonly align: 'left' | 'center' | 'right';
  readonly width: BindableSignal<number>;
  readonly lineHeight: number;
  readonly reveal: BindableSignal<number>;
  /**
   * Reveal fraction in [0, 1]; NaN (the default) means "unset" so plain `reveal`
   * is authoritative and the node stays byte-identical to one without it. When
   * not-NaN it overrides `reveal` via {@link effectiveReveal}.
   */
  readonly revealFraction: BindableSignal<number>;

  constructor(props: TextProps = {}) {
    super(props);
    this.text = initProp(signal(''), props.text);
    this.fill = initProp(signal('#000000'), props.fill);
    this.fontSize = initProp(signal(16), props.fontSize);
    this.fontFamily = props.fontFamily ?? 'sans-serif';
    this.fontWeight = props.fontWeight ?? 400;
    this.fontStyle = props.fontStyle ?? 'normal';
    this.fontVariationSettings = props.fontVariationSettings;
    this.align = props.align ?? 'left';
    this.width = initProp(signal(0), props.width);
    this.lineHeight = props.lineHeight ?? 1.25;
    this.reveal = initProp(signal(Number.POSITIVE_INFINITY), props.reveal);
    // NaN = "unset": plain `reveal` stays authoritative (byte-identical default).
    this.revealFraction = initProp(signal(Number.NaN), props.revealFraction);
    this.registerTarget('width', this.width, 'number');
    this.registerTarget('text', this.text, 'string');
    // Text fill is a plain color string (no gradients) — color only.
    this.registerTarget('fill', this.fill, 'color');
    this.registerTarget('fontSize', this.fontSize, 'number');
    this.registerTarget('reveal', this.reveal, 'number');
    this.registerTarget('revealFraction', this.revealFraction, 'number');
    // 0.20 STATIC passthrough: `fontVariationSettings` is threaded into the
    // FontSpec via `fontSpec()` and applied by the rasterizer (Skia/export). It
    // is NOT a registered target — animatable axes are deferred to 1.0, and a
    // track on `<id>/fontVariationSettings` hard-throws UnboundTargetError (no
    // signal resolves to it). When unset, fontSpec() omits the key, so default
    // Text emits a byte-identical FontSpec.
    if (new.target === Text) this.checkProps(props);
  }

  /**
   * The per-draw {@link FontSpec} — the single construction point every measure
   * / layout / draw path routes through, so the spec is identical across them.
   * `style: 'normal'` and an unset `fontVariationSettings` are OMITTED so a
   * default-style, no-axes Text emits a byte-identical FontSpec (§3.6; the
   * golden corpus depends on it).
   */
  private fontSpec(): FontSpec {
    return {
      family: this.fontFamily,
      size: this.fontSize(),
      weight: this.fontWeight,
      ...(this.fontStyle === 'italic' ? { style: 'italic' as const } : {}),
      ...(this.fontVariationSettings !== undefined ? { fontVariationSettings: this.fontVariationSettings } : {}),
    };
  }

  /**
   * The grapheme COUNT to reveal this frame — the single source the draw mask,
   * {@link revealHead}, and the masked emit path all read. When `revealFraction`
   * is set (not NaN) it wins: `round(clamp(fraction, 0, 1) * graphemeCount)`,
   * resolved against the SAME laid-out grapheme stream `reveal` counts. Unset
   * (NaN) it falls straight through to `reveal()`, so a node without
   * `revealFraction` is byte-identical to before this prop existed.
   */
  private effectiveReveal(measurer: TextMeasurer): number {
    const frac = this.revealFraction();
    if (Number.isNaN(frac)) return this.reveal();
    const total = this.graphemes(measurer).length;
    const clamped = frac <= 0 ? 0 : frac >= 1 ? 1 : frac;
    return Math.round(clamped * total);
  }

  override intrinsicSize(measurer: TextMeasurer): { w: number; h: number } {
    const text = this.text();
    if (!text) return { w: 0, h: 0 };
    const font: FontSpec = this.fontSpec();
    const maxWidth = this.width();
    const lines = breakLines(text, font, maxWidth > 0 ? maxWidth : undefined, measurer);
    const widest = Math.max(...lines.map((l) => quantize(measurer.measureText(l, font).width)), 0);
    return { w: maxWidth > 0 ? maxWidth : widest, h: quantize(font.size * this.lineHeight) * lines.length };
  }

  /** Text draws from a baseline origin at its align edge, not a center (§3.6). */
  override drawOffset(measurer?: TextMeasurer): { x: number; y: number } {
    const m = measurer ?? this.measurerSource?.() ?? fallbackMeasurer();
    const size = this.intrinsicSize(m);
    const font: FontSpec = this.fontSpec();
    const firstLine = breakLines(this.text(), font, this.width() > 0 ? this.width() : undefined, m)[0] ?? '';
    const ascent = m.measureText(firstLine, font).ascent;
    const x = this.align === 'left' ? 0 : this.align === 'center' ? -size.w / 2 : -size.w;
    return { x, y: -ascent };
  }

  /**
   * The wrapped box {w, h}, measured with the scene's active measurer — the
   * same numbers Layout flows with, public so bindings never hand-calculate
   * text dimensions (e.g. underline width = () => title.measuredSize().w).
   */
  measuredSize(measurer?: TextMeasurer): { w: number; h: number } {
    return this.intrinsicSize(measurer ?? this.measurerSource?.() ?? fallbackMeasurer());
  }

  /**
   * Per-line ink boxes in this node's DRAW space (origin = first baseline at
   * the align edge), from the same breakLines pass that draws. Pull-based:
   * re-measures when text/font/width animate. Blank lines (from '\n\n')
   * produce no box. The substrate for highlights, underlines, per-line
   * reveals, selections.
   */
  lineBoxes(measurer?: TextMeasurer): LineBox[] {
    const m = measurer ?? this.measurerSource?.() ?? fallbackMeasurer();
    // only the IMPLICIT fallback is a footgun: an explicit measurer was a
    // choice (splitText passes one through and warns at its own seam).
    if (measurer === undefined) warnIfEstimating(m, 'Text.lineBoxes');
    const text = this.text();
    if (!text) return [];
    const font: FontSpec = this.fontSpec();
    const maxWidth = this.width();
    const lines = breakLines(text, font, maxWidth > 0 ? maxWidth : undefined, m);
    const step = quantize(font.size * this.lineHeight);
    const boxes: LineBox[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const met = m.measureText(line, font);
      const w = quantize(met.width);
      const x = this.align === 'left' ? 0 : this.align === 'center' ? -w / 2 : -w;
      boxes.push({ text: line, x, y: i * step - met.ascent, w, h: met.ascent + met.descent });
    }
    return boxes;
  }

  /**
   * Per-word ink boxes within each laid-out line — the SAME segmentation the
   * breaker flows (Intl.Segmenter boundaries, punctuation glued), positioned
   * by cumulative prefix advances so cross-word kerning is exact and word
   * widths sum to the line's width. Whitespace contributes advance but no
   * box. Pair index-wise with a narration manifest's word timestamps for
   * karaoke; draw your own rects for sub-line multi-color token work.
   */
  wordBoxes(measurer?: TextMeasurer): WordBox[] {
    const m = measurer ?? this.measurerSource?.() ?? fallbackMeasurer();
    if (measurer === undefined) warnIfEstimating(m, 'Text.wordBoxes');
    const text = this.text();
    if (!text) return [];
    const font: FontSpec = this.fontSpec();
    const maxWidth = this.width();
    const lines = breakLines(text, font, maxWidth > 0 ? maxWidth : undefined, m);
    const step = quantize(font.size * this.lineHeight);
    const boxes: WordBox[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const met = m.measureText(line, font);
      const lineW = quantize(met.width);
      const lineX = this.align === 'left' ? 0 : this.align === 'center' ? -lineW / 2 : -lineW;
      const y = i * step - met.ascent;
      const h = met.ascent + met.descent;
      let prefix = '';
      for (const seg of segmentWords(line)) {
        const start = prefix;
        prefix += seg;
        const word = seg.trim();
        if (word === '') continue; // whitespace advances, but has no ink
        // punctuation gluing can fold ADJACENT whitespace into a segment
        // (' $' from '… $48,200'); the box covers only the ink, so trim the
        // surrounding whitespace advance off both ends
        const lead = seg.length - seg.trimStart().length;
        const before = m.measureText(start + seg.slice(0, lead), font).width;
        const after = m.measureText(start + seg.trimEnd(), font).width;
        boxes.push({ text: word, line: i, x: lineX + before, y, w: after - before, h });
      }
    }
    return boxes;
  }

  /**
   * Per-grapheme ink boxes within each laid-out line — the per-grapheme analogue
   * of {@link wordBoxes}, boxing the SAME grapheme units `reveal`/`graphemes()`
   * count (`Intl.Segmenter` boundaries via `segmentGraphemes`, so emoji/ZWJ
   * sequences stay whole). Positioned by cumulative prefix advances so
   * cross-grapheme kerning is exact and the boxes' advances sum to the line
   * width — the boundaries MATCH the draw path, so splitText goldens don't
   * drift. Whitespace graphemes advance but produce no box (dropped), exactly
   * as `wordBoxes()` trims whitespace advance. The substrate `splitText({ by:
   * 'grapheme' })` snapshots.
   */
  graphemeBoxes(measurer?: TextMeasurer): GraphemeBox[] {
    const m = measurer ?? this.measurerSource?.() ?? fallbackMeasurer();
    if (measurer === undefined) warnIfEstimating(m, 'Text.graphemeBoxes');
    const text = this.text();
    if (!text) return [];
    const font: FontSpec = this.fontSpec();
    const maxWidth = this.width();
    const lines = breakLines(text, font, maxWidth > 0 ? maxWidth : undefined, m);
    const step = quantize(font.size * this.lineHeight);
    const boxes: GraphemeBox[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const met = m.measureText(line, font);
      const lineW = quantize(met.width);
      const lineX = this.align === 'left' ? 0 : this.align === 'center' ? -lineW / 2 : -lineW;
      const y = i * step - met.ascent;
      const h = met.ascent + met.descent;
      let prefix = '';
      for (const g of segmentGraphemes(line)) {
        const start = prefix;
        prefix += g;
        if (g.trim() === '') continue; // whitespace advances, but has no ink
        // cumulative prefix advance (kerning-exact), the wordBoxes loop's logic
        const before = m.measureText(start, font).width;
        const after = m.measureText(start + g, font).width;
        boxes.push({ text: g, line: i, x: lineX + before, y, w: after - before, h });
      }
    }
    return boxes;
  }

  /**
   * The laid-out grapheme stream the typewriter reveal advances over — every
   * grapheme of every wrapped line, in reading order (soft-wrap whitespace is
   * dropped by the breaker, exactly as drawn, so draw/revealHead/revealSchedule
   * all agree). Pull-based; its length is the `reveal` count that shows
   * everything. Author a per-keystroke staircase straight off it:
   *
   *   const g = title.graphemes();
   *   track('title/reveal', 'number',
   *     g.map((_, i) => key(t0 + i * 0.05, i + 1, { interp: 'hold' })));
   */
  graphemes(measurer?: TextMeasurer): string[] {
    const m = measurer ?? this.measurerSource?.() ?? fallbackMeasurer();
    const text = this.text();
    if (!text) return [];
    const font: FontSpec = this.fontSpec();
    const maxWidth = this.width();
    const lines = breakLines(text, font, maxWidth > 0 ? maxWidth : undefined, m);
    const out: string[] = [];
    for (const line of lines) for (const g of segmentGraphemes(line)) out.push(g);
    return out;
  }

  /**
   * Draw-space position of the reveal head — the caret point just after the
   * last revealed grapheme, for the current `reveal` value. Drives TextCursor;
   * honours align and wrap exactly like wordBoxes(). At reveal 0 it sits at the
   * start of the first line; fully revealed, at the end of the last line.
   */
  revealHead(measurer?: TextMeasurer): { x: number; y: number; h: number; line: number; index: number } {
    const m = measurer ?? this.measurerSource?.() ?? fallbackMeasurer();
    const font: FontSpec = this.fontSpec();
    const maxWidth = this.width();
    const lines = breakLines(this.text(), font, maxWidth > 0 ? maxWidth : undefined, m);
    const step = quantize(font.size * this.lineHeight);
    const total = lines.reduce((n, l) => n + segmentGraphemes(l).length, 0);
    const revealRaw = this.effectiveReveal(m);
    const shown = Math.max(0, Math.min(Number.isFinite(revealRaw) ? Math.floor(revealRaw) : total, total));
    let remaining = shown;
    let last = { x: 0, y: 0, h: 0, line: 0, index: shown };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const met = m.measureText(line, font);
      const lineW = quantize(met.width);
      const lineX = this.align === 'left' ? 0 : this.align === 'center' ? -lineW / 2 : -lineW;
      const y = i * step - met.ascent;
      const h = met.ascent + met.descent;
      const gs = segmentGraphemes(line);
      // before consuming this line, the head could land at its start (remaining
      // 0); record it so a fully-consumed prior line hands off cleanly
      if (remaining <= gs.length) {
        const advance = remaining <= 0 ? 0 : m.measureText(gs.slice(0, remaining).join(''), font).width;
        return { x: lineX + advance, y, h, line: i, index: shown };
      }
      remaining -= gs.length;
      last = { x: lineX + met.width, y, h, line: i, index: shown };
    }
    return last;
  }

  protected draw(out: DisplayListBuilder, ctx: EvalContext): void {
    const text = this.text();
    if (!text) return;
    const font: FontSpec = this.fontSpec();
    const maxWidth = this.width();
    // line breaking is ours (§3.6), measured by the injected backend measurer
    const lines = breakLines(text, font, maxWidth > 0 ? maxWidth : undefined, ctx.measurer);
    const step = quantize(font.size * this.lineHeight);
    // Reveal masking: Infinity (the default) takes the original emit path
    // untouched, so any scene without a reveal track is byte-identical. A
    // finite reveal breaks lines on the FULL text (no reflow) and draws the
    // revealed grapheme prefix; a fully-shown line emits identically to the
    // unmasked path, a partial line is positioned by hand so its substring
    // does not recenter under align.
    const revealRaw = this.effectiveReveal(ctx.measurer);
    const masked = Number.isFinite(revealRaw);
    let remaining = masked ? Math.max(0, Math.floor(revealRaw)) : 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (!masked) {
        out.push({
          op: 'fillText',
          text: line,
          font,
          paint: { kind: 'color', color: this.fill() },
          x: 0,
          y: i * step,
          ...(this.align !== 'left' ? { align: this.align } : {}),
        });
        continue;
      }
      if (remaining <= 0) break;
      const gs = segmentGraphemes(line);
      const show = Math.min(remaining, gs.length);
      remaining -= show;
      if (show === gs.length) {
        out.push({
          op: 'fillText',
          text: line,
          font,
          paint: { kind: 'color', color: this.fill() },
          x: 0,
          y: i * step,
          ...(this.align !== 'left' ? { align: this.align } : {}),
        });
      } else {
        // partial line: anchor at the FULL line's align edge, draw the prefix
        // with no align so it grows left-to-right without re-centering
        const met = ctx.measurer.measureText(line, font);
        const lineW = quantize(met.width);
        const lineX = this.align === 'left' ? 0 : this.align === 'center' ? -lineW / 2 : -lineW;
        out.push({
          op: 'fillText',
          text: gs.slice(0, show).join(''),
          font,
          paint: { kind: 'color', color: this.fill() },
          x: lineX,
          y: i * step,
        });
      }
    }
  }
}

/** One revealed grapheme's timing + draw-space position — the keystroke sync
 * contract, the direct analogue of narrate's TimedWord[]. SFX maps each mark to
 * one AudioClip at `at: time`; visuals can place per-key effects at (x, y). */
export interface RevealMark {
  /** index into the laid-out grapheme stream (Text.graphemes()) */
  charIndex: number;
  /** the revealed grapheme (raw — char-class policy is the consumer's) */
  grapheme: string;
  /** time the grapheme first becomes visible, from the reveal track */
  time: number;
  /** caret x just after this grapheme, in the Text's draw space */
  x: number;
  /** top of the grapheme's line box, in the Text's draw space */
  y: number;
  /** laid-out line index */
  line: number;
}

/**
 * Pure per-grapheme schedule from a Text and its reveal track — geometry from
 * the text, timing from the track. A grapheme's time is the first key whose
 * value reveals it (value >= index + 1); graphemes the track never reaches are
 * omitted. The single source SFX keystroke-sync consumes (keystrokeClips()):
 * one click per mark at `at: mark.time`, char-class policy (skip space/newline,
 * pick a sample) decided downstream from `mark.grapheme`.
 */
export function revealSchedule(text: Text, reveal: Track<number>, measurer?: TextMeasurer): RevealMark[] {
  const m = measurer ?? text.measurerSource?.() ?? fallbackMeasurer();
  const src = text.text();
  if (!src) return [];
  const font: FontSpec = {
    family: text.fontFamily,
    size: text.fontSize(),
    weight: text.fontWeight,
    ...(text.fontStyle === 'italic' ? { style: 'italic' as const } : {}),
    ...(text.fontVariationSettings !== undefined ? { fontVariationSettings: text.fontVariationSettings } : {}),
  };
  const maxWidth = text.width();
  const lines = breakLines(src, font, maxWidth > 0 ? maxWidth : undefined, m);
  const step = quantize(font.size * text.lineHeight);
  const keys = reveal.keys;
  const marks: RevealMark[] = [];
  let k = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line) continue;
    const met = m.measureText(line, font);
    const lineW = quantize(met.width);
    const lineX = text.align === 'left' ? 0 : text.align === 'center' ? -lineW / 2 : -lineW;
    const y = li * step - met.ascent;
    let prefix = '';
    for (const g of segmentGraphemes(line)) {
      prefix += g;
      const need = k + 1;
      let time = Number.POSITIVE_INFINITY;
      for (const key of keys) {
        if (key.value >= need) {
          time = key.t;
          break;
        }
      }
      if (Number.isFinite(time)) {
        marks.push({ charIndex: k, grapheme: g, time, x: lineX + m.measureText(prefix, font).width, y, line: li });
      }
      k++;
    }
  }
  return marks;
}

/**
 * Built-in nodes for M1 (DESIGN.md §3.1): Group, Rect, Circle, Text.
 * Path/Image/Video/Layout arrive with their milestones.
 */

import { random, signal, type BindableSignal, type PathValue, type Track, type Vec2 } from '@glissade/core';
import { type DisplayListBuilder, type FontSpec, type PathSeg } from './displayList.js';
import { arcLength, flatten, hashStr, roughen, validateSketch, type SketchStyle } from './sketch.js';
import { Node, type EvalContext, type NodeProps, type PropInit } from './node.js';
import {
  breakLines,
  fallbackMeasurer,
  quantize,
  segmentGraphemes,
  segmentWords,
  type TextMeasurer,
} from './text.js';

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
  readonly children: Node[];

  constructor(props: NodeProps & { children?: Node[] } = {}) {
    super(props);
    this.children = props.children ?? [];
    for (const child of this.children) child.parent = this;
  }

  add(child: Node): this {
    child.parent = this;
    this.children.push(child);
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

export interface ShapeProps extends NodeProps {
  fill?: PropInit<string>;
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
}

abstract class Shape extends Node {
  readonly fill: BindableSignal<string>;
  readonly stroke: BindableSignal<string>;
  readonly strokeWidth: BindableSignal<number>;
  readonly sketch: SketchStyle | undefined;
  readonly sketchSeed: number;
  readonly reveal: BindableSignal<number>;

  constructor(props: ShapeProps = {}) {
    super(props);
    this.fill = initProp(signal(''), props.fill);
    this.stroke = initProp(signal(''), props.stroke);
    this.strokeWidth = initProp(signal(0), props.strokeWidth);
    this.reveal = initProp(signal(1), props.reveal);
    this.registerTarget('fill', this.fill);
    this.registerTarget('stroke', this.stroke);
    this.registerTarget('strokeWidth', this.strokeWidth);
    this.registerTarget('reveal', this.reveal);
    if (props.sketch) validateSketch(props.sketch);
    this.sketch = props.sketch;
    this.sketchSeed = props.sketchSeed ?? (this.id !== undefined ? hashStr(this.id) : 0);
  }

  protected abstract pathSegs(): PathSeg[];

  protected draw(out: DisplayListBuilder): void {
    const segs = this.pathSegs();
    if (this.sketch) return this.drawSketch(out, segs);
    const path = out.resource({ kind: 'path', segs });
    const fill = this.fill();
    if (fill) out.push({ op: 'fillPath', path, paint: { kind: 'color', color: fill } });
    const stroke = this.stroke();
    const width = this.strokeWidth();
    if (stroke && width > 0) {
      out.push({ op: 'strokePath', path, paint: { kind: 'color', color: stroke }, stroke: { width } });
    }
  }

  /** Hand-drawn render: solid fill (if any) under roughened, multi-pass strokes.
   * The seed is consumed fresh each draw, so re-evaluation is byte-identical. */
  private drawSketch(out: DisplayListBuilder, segs: PathSeg[]): void {
    const fill = this.fill();
    if (fill) {
      const path = out.resource({ kind: 'path', segs });
      out.push({ op: 'fillPath', path, paint: { kind: 'color', color: fill } });
    }
    const { strokes, resolved } = roughen(segs, this.sketch!, random(this.sketchSeed >>> 0));
    const ink = this.stroke() || fill || '#000000';
    const reveal = this.reveal();
    const drawOn = reveal < 1; // strict: reveal >= 1 takes the byte-identical path
    for (const passSegs of strokes) {
      if (passSegs.length === 0) continue;
      if (drawOn) {
        // draw-on via a retreating dash, PER CONTOUR (canvas restarts the dash
        // phase at each subpath move), so each contour reveals from its own start
        for (const contour of splitContours(passSegs)) {
          const len = flatten(contour).reduce((s, p) => s + arcLength(p), 0);
          const path = out.resource({ kind: 'path', segs: contour });
          out.push({
            op: 'strokePath',
            path,
            paint: { kind: 'color', color: ink },
            stroke: { width: resolved.width, cap: 'round', join: 'round', dash: [len, len], dashOffset: len * (1 - reveal) },
          });
        }
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
    this.registerTarget('width', this.width);
    this.registerTarget('height', this.height);
    this.registerTarget('cornerRadius', this.cornerRadius);
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
  readonly radius: BindableSignal<number>;

  constructor(props: ShapeProps & { radius?: PropInit<number> } = {}) {
    super(props);
    this.radius = initProp(signal(0), props.radius);
    this.registerTarget('radius', this.radius);
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
  /** The geometry (§2.2 'path' value): bezier contours in vertex form, animatable via a track on '<id>/d'. */
  data?: PropInit<PathValue>;
}

/**
 * Arbitrary bezier geometry — the Lottie-import landing spot and the target
 * of native path morphs. Coordinates are node-local (the node origin is
 * wherever the author put 0,0); flow placement uses the control-point bounds.
 */
export class Path extends Shape {
  readonly data: BindableSignal<PathValue>;

  constructor(props: PathProps = {}) {
    super(props);
    this.data = initProp(signal<PathValue>([]), props.data);
    this.registerTarget('d', this.data);
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
  readonly assetId: string;
  readonly width: BindableSignal<number>;
  readonly height: BindableSignal<number>;

  constructor(props: ImageProps) {
    super(props);
    this.assetId = props.assetId;
    this.width = initProp(signal(0), props.width);
    this.height = initProp(signal(0), props.height);
    this.registerTarget('width', this.width);
    this.registerTarget('height', this.height);
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
    this.registerTarget('width', this.width);
    this.registerTarget('height', this.height);
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

export interface TextProps extends NodeProps {
  text?: PropInit<string>;
  fill?: PropInit<string>;
  fontFamily?: string;
  fontSize?: PropInit<number>;
  fontWeight?: number;
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
}

export class Text extends Node {
  readonly text: BindableSignal<string>;
  readonly fill: BindableSignal<string>;
  readonly fontSize: BindableSignal<number>;
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly align: 'left' | 'center' | 'right';
  readonly width: BindableSignal<number>;
  readonly lineHeight: number;
  readonly reveal: BindableSignal<number>;

  constructor(props: TextProps = {}) {
    super(props);
    this.text = initProp(signal(''), props.text);
    this.fill = initProp(signal('#000000'), props.fill);
    this.fontSize = initProp(signal(16), props.fontSize);
    this.fontFamily = props.fontFamily ?? 'sans-serif';
    this.fontWeight = props.fontWeight ?? 400;
    this.align = props.align ?? 'left';
    this.width = initProp(signal(0), props.width);
    this.lineHeight = props.lineHeight ?? 1.25;
    this.reveal = initProp(signal(Number.POSITIVE_INFINITY), props.reveal);
    this.registerTarget('width', this.width);
    this.registerTarget('text', this.text);
    this.registerTarget('fill', this.fill);
    this.registerTarget('fontSize', this.fontSize);
    this.registerTarget('reveal', this.reveal);
  }

  override intrinsicSize(measurer: TextMeasurer): { w: number; h: number } {
    const text = this.text();
    if (!text) return { w: 0, h: 0 };
    const font: FontSpec = { family: this.fontFamily, size: this.fontSize(), weight: this.fontWeight };
    const maxWidth = this.width();
    const lines = breakLines(text, font, maxWidth > 0 ? maxWidth : undefined, measurer);
    const widest = Math.max(...lines.map((l) => quantize(measurer.measureText(l, font).width)), 0);
    return { w: maxWidth > 0 ? maxWidth : widest, h: quantize(font.size * this.lineHeight) * lines.length };
  }

  /** Text draws from a baseline origin at its align edge, not a center (§3.6). */
  override drawOffset(measurer?: TextMeasurer): { x: number; y: number } {
    const m = measurer ?? this.measurerSource?.() ?? fallbackMeasurer();
    const size = this.intrinsicSize(m);
    const font: FontSpec = { family: this.fontFamily, size: this.fontSize(), weight: this.fontWeight };
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
    const text = this.text();
    if (!text) return [];
    const font: FontSpec = { family: this.fontFamily, size: this.fontSize(), weight: this.fontWeight };
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
    const text = this.text();
    if (!text) return [];
    const font: FontSpec = { family: this.fontFamily, size: this.fontSize(), weight: this.fontWeight };
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
    const font: FontSpec = { family: this.fontFamily, size: this.fontSize(), weight: this.fontWeight };
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
    const font: FontSpec = { family: this.fontFamily, size: this.fontSize(), weight: this.fontWeight };
    const maxWidth = this.width();
    const lines = breakLines(this.text(), font, maxWidth > 0 ? maxWidth : undefined, m);
    const step = quantize(font.size * this.lineHeight);
    const total = lines.reduce((n, l) => n + segmentGraphemes(l).length, 0);
    const revealRaw = this.reveal();
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
    const font: FontSpec = { family: this.fontFamily, size: this.fontSize(), weight: this.fontWeight };
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
    const revealRaw = this.reveal();
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
  const font: FontSpec = { family: text.fontFamily, size: text.fontSize(), weight: text.fontWeight };
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

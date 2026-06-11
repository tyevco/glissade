/**
 * Built-in nodes for M1 (DESIGN.md §3.1): Group, Rect, Circle, Text.
 * Path/Image/Video/Layout arrive with their milestones.
 */

import { signal, type BindableSignal } from '@glissade/core';
import { type DisplayListBuilder, type FontSpec, type PathSeg } from './displayList.js';
import { Node, type EvalContext, type NodeProps, type PropInit } from './node.js';
import { breakLines, quantize } from './text.js';

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
}

abstract class Shape extends Node {
  readonly fill: BindableSignal<string>;
  readonly stroke: BindableSignal<string>;
  readonly strokeWidth: BindableSignal<number>;

  constructor(props: ShapeProps = {}) {
    super(props);
    this.fill = initProp(signal(''), props.fill);
    this.stroke = initProp(signal(''), props.stroke);
    this.strokeWidth = initProp(signal(0), props.strokeWidth);
    this.registerTarget('fill', this.fill);
    this.registerTarget('stroke', this.stroke);
    this.registerTarget('strokeWidth', this.strokeWidth);
  }

  protected abstract pathSegs(): PathSeg[];

  protected draw(out: DisplayListBuilder): void {
    const segs = this.pathSegs();
    const path = out.resource({ kind: 'path', segs });
    const fill = this.fill();
    if (fill) out.push({ op: 'fillPath', path, paint: { kind: 'color', color: fill } });
    const stroke = this.stroke();
    const width = this.strokeWidth();
    if (stroke && width > 0) {
      out.push({ op: 'strokePath', path, paint: { kind: 'color', color: stroke }, stroke: { width } });
    }
  }
}

function initProp<T>(sig: BindableSignal<T>, init: PropInit<T> | undefined): BindableSignal<T> {
  if (typeof init === 'function') sig.bindSource(init as () => T);
  else if (init !== undefined) sig.set(init);
  return sig;
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

  // centered at the node origin (Motion Canvas convention)
  protected pathSegs(): PathSeg[] {
    const w = this.width();
    const h = this.height();
    const x = -w / 2;
    const y = -h / 2;
    const r = Math.min(Math.max(0, this.cornerRadius()), w / 2, h / 2);
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
}

export class Circle extends Shape {
  readonly radius: BindableSignal<number>;

  constructor(props: ShapeProps & { radius?: PropInit<number> } = {}) {
    super(props);
    this.radius = initProp(signal(0), props.radius);
    this.registerTarget('radius', this.radius);
  }

  protected pathSegs(): PathSeg[] {
    const r = this.radius();
    return [['E', 0, 0, r, r, 0, 0, Math.PI * 2], ['Z']];
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
    this.registerTarget('width', this.width);
    this.registerTarget('text', this.text);
    this.registerTarget('fill', this.fill);
    this.registerTarget('fontSize', this.fontSize);
  }

  protected draw(out: DisplayListBuilder, ctx: EvalContext): void {
    const text = this.text();
    if (!text) return;
    const font: FontSpec = { family: this.fontFamily, size: this.fontSize(), weight: this.fontWeight };
    const maxWidth = this.width();
    // line breaking is ours (§3.6), measured by the injected backend measurer
    const lines = breakLines(text, font, maxWidth > 0 ? maxWidth : undefined, ctx.measurer);
    const step = quantize(font.size * this.lineHeight);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      out.push({
        op: 'fillText',
        text: lines[i]!,
        font,
        paint: { kind: 'color', color: this.fill() },
        x: 0,
        y: i * step,
        ...(this.align !== 'left' ? { align: this.align } : {}),
      });
    }
  }
}

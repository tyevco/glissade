/**
 * Built-in nodes for M1 (DESIGN.md §3.1): Group, Rect, Circle, Text.
 * Path/Image/Video/Layout arrive with their milestones.
 */

import { signal, type BindableSignal } from '@glissade/core';
import { type DisplayListBuilder, type FontSpec, type PathSeg } from './displayList.js';
import { Node, type EvalContext, type NodeProps, type PropInit } from './node.js';

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

  constructor(props: ShapeProps & { width?: PropInit<number>; height?: PropInit<number> } = {}) {
    super(props);
    this.width = initProp(signal(0), props.width);
    this.height = initProp(signal(0), props.height);
    this.registerTarget('width', this.width);
    this.registerTarget('height', this.height);
  }

  // centered at the node origin (Motion Canvas convention)
  protected pathSegs(): PathSeg[] {
    const w = this.width();
    const h = this.height();
    const x = -w / 2;
    const y = -h / 2;
    return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
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

export interface TextProps extends NodeProps {
  text?: PropInit<string>;
  fill?: PropInit<string>;
  fontFamily?: string;
  fontSize?: PropInit<number>;
  fontWeight?: number;
}

export class Text extends Node {
  readonly text: BindableSignal<string>;
  readonly fill: BindableSignal<string>;
  readonly fontSize: BindableSignal<number>;
  readonly fontFamily: string;
  readonly fontWeight: number;

  constructor(props: TextProps = {}) {
    super(props);
    this.text = initProp(signal(''), props.text);
    this.fill = initProp(signal('#000000'), props.fill);
    this.fontSize = initProp(signal(16), props.fontSize);
    this.fontFamily = props.fontFamily ?? 'sans-serif';
    this.fontWeight = props.fontWeight ?? 400;
    this.registerTarget('text', this.text);
    this.registerTarget('fill', this.fill);
    this.registerTarget('fontSize', this.fontSize);
  }

  protected draw(out: DisplayListBuilder): void {
    const text = this.text();
    if (!text) return;
    const font: FontSpec = { family: this.fontFamily, size: this.fontSize(), weight: this.fontWeight };
    // M1: single line at the node origin; line breaking lands with TextMeasurer (§3.6)
    out.push({ op: 'fillText', text, font, paint: { kind: 'color', color: this.fill() }, x: 0, y: 0 });
  }
}

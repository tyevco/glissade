/**
 * SVG element tree → glissade scene nodes. Covers `<path>` and the basic shapes
 * (rect/circle/ellipse/line/polyline/polygon), `<g>` grouping, transforms
 * (translate/scale/rotate/matrix → node TRS, applied like SVG via a wrapping
 * Group), fill/stroke/stroke-width with presentation inheritance. Unsupported
 * features (text, images, gradients, filters, masks) are dropped with a warning.
 */

import type { PathValue, Vec2 } from '@glissade/core';
import { Circle, Group, Path, Rect, pathFromSegs, type Node, type PathSeg } from '@glissade/scene';
import { parseSvgPath } from './parser.js';
import type { XmlNode } from './xml.js';

const num = (v: string | undefined, d = 0): number => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : d;
};

function color(v: string | undefined, warnings: string[]): string | undefined {
  if (v === undefined) return undefined;
  const c = v.trim();
  if (c === '' || c === 'none') return undefined;
  if (c.startsWith('url(')) {
    warnings.push(`gradient/pattern paint not supported (${c}); dropped`);
    return undefined;
  }
  return c; // hex / named / rgb() — the backends accept CSS color strings
}

interface Paint {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

/** Resolve this element's paint, inheriting from the parent (SVG presentation). */
function resolvePaint(attrs: Record<string, string>, inh: Paint, warnings: string[]): Paint {
  const fill = 'fill' in attrs ? color(attrs['fill'], warnings) : inh.fill;
  const stroke = 'stroke' in attrs ? color(attrs['stroke'], warnings) : inh.stroke;
  const strokeWidth = 'stroke-width' in attrs ? num(attrs['stroke-width'], 1) : inh.strokeWidth;
  return {
    ...(fill !== undefined ? { fill } : {}),
    ...(stroke !== undefined ? { stroke } : {}),
    ...(strokeWidth !== undefined ? { strokeWidth } : {}),
  };
}

const shapeProps = (p: Paint): { fill?: string; stroke?: string; strokeWidth?: number } => ({
  ...(p.fill !== undefined ? { fill: p.fill } : {}),
  ...(p.stroke !== undefined ? { stroke: p.stroke } : {}),
  ...(p.strokeWidth !== undefined ? { strokeWidth: p.strokeWidth } : {}),
});

/** Compose an SVG transform list into a node TRS (skew is dropped + warned). */
function parseTransform(s: string | undefined, warnings: string[]): { position: Vec2; rotation: number; scale: Vec2 } | null {
  if (!s) return null;
  let M = [1, 0, 0, 1, 0, 0];
  const mul = (m: number[]): void => {
    const [a, b, c, d, e, f] = M;
    const [A, B, C, D, E, F] = m;
    M = [a! * A! + c! * B!, b! * A! + d! * B!, a! * C! + c! * D!, b! * C! + d! * D!, a! * E! + c! * F! + e!, b! * E! + d! * F! + f!];
  };
  const re = /(translate|scale|rotate|matrix|skewX|skewY)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = re.exec(s)) !== null) {
    any = true;
    const args = m[2]!.split(/[\s,]+/).filter(Boolean).map(parseFloat);
    switch (m[1]) {
      case 'translate':
        mul([1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0]);
        break;
      case 'scale':
        mul([args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0]);
        break;
      case 'rotate': {
        const r = ((args[0] ?? 0) * Math.PI) / 180;
        const rot = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
        if (args.length >= 3) {
          mul([1, 0, 0, 1, args[1]!, args[2]!]);
          mul(rot);
          mul([1, 0, 0, 1, -args[1]!, -args[2]!]);
        } else mul(rot);
        break;
      }
      case 'matrix':
        if (args.length === 6) mul(args);
        break;
      default:
        warnings.push(`transform ${m[1]}() (skew) not supported; dropped`);
    }
  }
  if (!any) return null;
  const [a, b, c, d, e, f] = M;
  const sx = Math.hypot(a!, b!);
  const det = a! * d! - b! * c!;
  const sy = sx === 0 ? 0 : det / sx;
  return { position: [e!, f!], rotation: (Math.atan2(b!, a!) * 180) / Math.PI, scale: [sx, sy] };
}

const ellipsePath = (cx: number, cy: number, rx: number, ry: number): PathValue =>
  pathFromSegs([['M', cx + rx, cy], ['E', cx, cy, rx, ry, 0, 0, Math.PI * 2], ['Z']]);

const pointsToSegs = (pts: string, close: boolean): PathSeg[] => {
  const n = pts.split(/[\s,]+/).filter(Boolean).map(parseFloat);
  const segs: PathSeg[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) segs.push([i === 0 ? 'M' : 'L', n[i]!, n[i + 1]!]);
  if (close) segs.push(['Z']);
  return segs;
};

/** Convert one element (and its subtree) to a node, or null if it produces none. */
function convertElement(el: XmlNode, inh: Paint, warnings: string[]): Node | null {
  const tag = el.tag.replace(/^.*:/, ''); // strip any namespace prefix
  const a = el.attrs;
  const paint = resolvePaint(a, inh, warnings);
  const wrap = (node: Node): Node => {
    const t = parseTransform(a['transform'], warnings);
    return t ? new Group({ position: t.position, rotation: t.rotation, scale: t.scale, children: [node] }) : node;
  };

  switch (tag) {
    case 'g':
    case 'svg': {
      const children = el.children.map((c) => convertElement(c, paint, warnings)).filter((n): n is Node => n !== null);
      const t = parseTransform(a['transform'], warnings);
      return new Group({ ...(t ? { position: t.position, rotation: t.rotation, scale: t.scale } : {}), children });
    }
    case 'path': {
      if (!a['d']) return null;
      return wrap(new Path({ data: pathFromSegs(parseSvgPath(a['d'])), ...shapeProps(paint) }));
    }
    case 'rect': {
      const x = num(a['x']);
      const y = num(a['y']);
      const w = num(a['width']);
      const h = num(a['height']);
      const r = num(a['rx'] ?? a['ry']);
      return wrap(new Rect({ position: [x + w / 2, y + h / 2], width: w, height: h, ...(r ? { cornerRadius: r } : {}), ...shapeProps(paint) }));
    }
    case 'circle':
      return wrap(new Circle({ position: [num(a['cx']), num(a['cy'])], radius: num(a['r']), ...shapeProps(paint) }));
    case 'ellipse':
      return wrap(new Path({ data: ellipsePath(num(a['cx']), num(a['cy']), num(a['rx']), num(a['ry'])), ...shapeProps(paint) }));
    case 'line':
      return wrap(new Path({ data: pathFromSegs([['M', num(a['x1']), num(a['y1'])], ['L', num(a['x2']), num(a['y2'])]]), ...shapeProps(paint) }));
    case 'polyline':
      return wrap(new Path({ data: pathFromSegs(pointsToSegs(a['points'] ?? '', false)), ...shapeProps(paint) }));
    case 'polygon':
      return wrap(new Path({ data: pathFromSegs(pointsToSegs(a['points'] ?? '', true)), ...shapeProps(paint) }));
    case 'defs':
    case 'title':
    case 'desc':
    case 'metadata':
    case 'style':
      return null; // silently skipped
    case 'text':
    case 'image':
    case 'use':
    case 'linearGradient':
    case 'radialGradient':
    case 'filter':
    case 'mask':
    case 'clipPath':
    case 'pattern':
      warnings.push(`<${tag}> not supported; dropped`);
      return null;
    default:
      return null;
  }
}

export interface ConvertResult {
  size: { w: number; h: number };
  root: Group;
  warnings: string[];
}

/** Convert a parsed SVG root element into a scene-ready Group + size. */
export function convertSvg(svg: XmlNode): ConvertResult {
  const warnings: string[] = [];
  const a = svg.attrs;
  let w = num(a['width']);
  let h = num(a['height']);
  if ((!w || !h) && a['viewBox']) {
    const vb = a['viewBox'].split(/[\s,]+/).filter(Boolean).map(parseFloat);
    if (vb.length === 4) {
      w = w || vb[2]!;
      h = h || vb[3]!;
    }
  }
  // SVG initial paint: fill black, stroke none, stroke-width 1
  const root = convertElement(svg, { fill: 'black', strokeWidth: 1 }, warnings) as Group;
  return { size: { w: w || 100, h: h || 100 }, root, warnings };
}

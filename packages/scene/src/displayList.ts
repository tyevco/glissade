/**
 * The DisplayList IR (DESIGN.md §3.3): a flat, serializable draw-command
 * stream plus an interned resource table. Nodes never touch a rendering
 * context; backends consume this.
 */

import { type Mat2x3 } from './matrix.js';

export type ResourceId = number;

/**
 * Path data as plain segments (JSON-serializable; backends build Path2D/SkPath):
 *   M/L: point; C: cubic; Q: quadratic; Z: close
 *   E: ellipse arc — cx, cy, rx, ry, rotationRad, startAngleRad, endAngleRad
 */
export type PathSeg =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Q', number, number, number, number]
  | ['E', number, number, number, number, number, number, number]
  | ['Z'];

export type Resource =
  | { kind: 'path'; segs: PathSeg[] }
  | { kind: 'image'; assetId: string }
  /** One source-grid video frame: backends resolve via their VideoFrameSource registry (§3.8). */
  | { kind: 'videoFrame'; assetId: string; mediaT: number };

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten';

/** M1: solid colors. Gradients/patterns are additive later — backends switch on kind. */
export type Paint = { kind: 'color'; color: string };

export interface StrokeStyle {
  width: number;
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
  miterLimit?: number;
  dash?: number[];
  dashOffset?: number;
}

export interface FontSpec {
  family: string;
  size: number;
  weight?: number;
  style?: 'normal' | 'italic';
}

/** Enumerated at M2 (§3.4); reserved in the IR now. */
export interface FilterSpec {
  kind: string;
  [k: string]: unknown;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DrawCommand =
  | { op: 'save' }
  | { op: 'restore' }
  | { op: 'transform'; m: Mat2x3 }
  | { op: 'clip'; path: ResourceId; rule?: 'nonzero' | 'evenodd' }
  | { op: 'fillPath'; path: ResourceId; paint: Paint }
  | { op: 'strokePath'; path: ResourceId; paint: Paint; stroke: StrokeStyle }
  | { op: 'fillText'; text: string; font: FontSpec; paint: Paint; x: number; y: number }
  | { op: 'drawImage'; image: ResourceId; src?: Rect; dst: Rect; smoothing?: boolean }
  | { op: 'pushGroup'; opacity: number; blend: BlendMode; filters: FilterSpec[]; cacheKey?: string }
  | { op: 'popGroup' };

export interface DisplayList {
  commands: DrawCommand[];
  resources: Resource[];
  size: { w: number; h: number };
}

export interface DisplayListBuilder {
  push(cmd: DrawCommand): void;
  resource(res: Resource): ResourceId;
}

export function createDisplayListBuilder(size: { w: number; h: number }): DisplayListBuilder & {
  finish(): DisplayList;
} {
  const commands: DrawCommand[] = [];
  const resources: Resource[] = [];
  const interned = new Map<string, ResourceId>();
  return {
    push: (cmd) => {
      commands.push(cmd);
    },
    resource: (res) => {
      const k = JSON.stringify(res);
      const hit = interned.get(k);
      if (hit !== undefined) return hit;
      const id = resources.length;
      resources.push(res);
      interned.set(k, id);
      return id;
    },
    finish: () => ({ commands, resources, size }),
  };
}

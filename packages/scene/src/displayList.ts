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

/**
 * Group filters (§3.4): a CLOSED union — validated data, never a CSS
 * passthrough string — limited to effects both rasterizers implement
 * faithfully. Cross-backend parity is perceptual (SSIM), not byte-exact:
 * filters are where rasterizers diverge most. Per-backend output stays
 * deterministic on the pinned toolchain (golden-tested on Skia).
 */
export type FilterSpec =
  | { kind: 'blur'; /** Gaussian stdDeviation, px; ≥ 0. */ radius: number }
  | { kind: 'drop-shadow'; dx: number; dy: number; /** ≥ 0 */ blur: number; color: string }
  | { kind: 'brightness'; /** 1 = identity; ≥ 0. */ amount: number }
  | { kind: 'contrast'; /** 1 = identity; ≥ 0. */ amount: number }
  | { kind: 'saturate'; /** 1 = identity; ≥ 0. */ amount: number };

export class FilterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterValidationError';
  }
}

const FILTER_KINDS = new Set(['blur', 'drop-shadow', 'brightness', 'contrast', 'saturate']);

/** Document-layer validation: reject unknown kinds and out-of-range params loudly. */
export function validateFilters(filters: readonly FilterSpec[]): void {
  for (const f of filters) {
    if (!FILTER_KINDS.has((f as { kind: string }).kind)) {
      throw new FilterValidationError(
        `unknown filter kind '${String((f as { kind: string }).kind)}' (have: ${[...FILTER_KINDS].join(', ')})`,
      );
    }
    if (f.kind === 'blur' && !(Number.isFinite(f.radius) && f.radius >= 0)) {
      throw new FilterValidationError(`blur radius must be ≥ 0, got ${String(f.radius)}`);
    }
    if (f.kind === 'drop-shadow') {
      if (![f.dx, f.dy, f.blur].every(Number.isFinite) || f.blur < 0) {
        throw new FilterValidationError('drop-shadow needs finite dx/dy and blur ≥ 0');
      }
      if (typeof f.color !== 'string' || f.color.length === 0) {
        throw new FilterValidationError('drop-shadow needs a color string');
      }
    }
    if ((f.kind === 'brightness' || f.kind === 'contrast' || f.kind === 'saturate') &&
        !(Number.isFinite(f.amount) && f.amount >= 0)) {
      throw new FilterValidationError(`${f.kind} amount must be ≥ 0, got ${String((f as { amount: number }).amount)}`);
    }
  }
}

/**
 * Compile the validated union to the canvas 2D `ctx.filter` syntax — both
 * backends speak it (browser canvas and @napi-rs/canvas/Skia). This is the
 * ONLY place the CSS-like syntax appears; documents never carry it.
 */
export function filtersToCanvasFilter(filters: readonly FilterSpec[]): string {
  if (filters.length === 0) return 'none';
  return filters
    .map((f) => {
      switch (f.kind) {
        case 'blur':
          return `blur(${f.radius}px)`;
        case 'drop-shadow':
          return `drop-shadow(${f.dx}px ${f.dy}px ${f.blur}px ${f.color})`;
        default:
          return `${f.kind}(${f.amount})`;
      }
    })
    .join(' ');
}

/**
 * Outer glow as stacked zero-offset drop-shadows — the classic recipe, fully
 * deterministic on both backends (it is just filters). intensity stacks more
 * layers; pair with a signal binding to follow an animated fill.
 */
export function glow(color: string, radius = 16, intensity = 2): FilterSpec[] {
  const layers: FilterSpec[] = [];
  for (let i = 0; i < Math.max(1, intensity); i++) {
    layers.push({ kind: 'drop-shadow', dx: 0, dy: 0, blur: radius * (1 + i * 1.5), color });
  }
  return layers;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Shader effect pass (§3.7): runs over the group's rasterized texture.
 * EXPLICITLY outside the determinism guarantee — GPU/driver per-pixel
 * variance breaks distributed reproducibility; export with shaders is
 * best-effort, single machine. Uniform VALUES are resolved at emit time
 * (they ride on signals), so the IR stays a plain serializable snapshot.
 */
export interface ShaderRef {
  /** WGSL fragment module: declare `struct Uniforms` + `@fragment fn effect(@location(0) uv: vec2f) -> @location(0) vec4f`. */
  wgsl: string;
  /** Scalar uniforms, packed as f32 in SORTED KEY ORDER into the Uniforms struct. */
  uniforms: Record<string, number>;
  /** Named texture inputs: binding name → image/video asset id (the source canvas is binding 0). Reserved for multi-input passes. */
  textures?: Record<string, string>;
}

export type DrawCommand =
  | { op: 'save' }
  | { op: 'restore' }
  | { op: 'transform'; m: Mat2x3 }
  | { op: 'clip'; path: ResourceId; rule?: 'nonzero' | 'evenodd' }
  | { op: 'fillPath'; path: ResourceId; paint: Paint }
  | { op: 'strokePath'; path: ResourceId; paint: Paint; stroke: StrokeStyle }
  | { op: 'fillText'; text: string; font: FontSpec; paint: Paint; x: number; y: number; align?: 'left' | 'center' | 'right' }
  | { op: 'drawImage'; image: ResourceId; src?: Rect; dst: Rect; smoothing?: boolean }
  | { op: 'pushGroup'; opacity: number; blend: BlendMode; filters: FilterSpec[]; shader?: ShaderRef; cacheKey?: string }
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
      if (cmd.op === 'pushGroup' && cmd.filters.length > 0) validateFilters(cmd.filters);
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

/**
 * The DisplayList IR (DESIGN.md §3.3): a flat, serializable draw-command
 * stream plus an interned resource table. Nodes never touch a rendering
 * context; backends consume this.
 */

import { type Mat2x3 } from './matrix.js';
// The byte-preserving cacheKey replacer lives in its own tiny module so the heavy
// diff/snapshot diagnostic surface (`displayDiff.ts` → `@glissade/scene/diagnostics`)
// stays OFF the base render graph (0.20 budget review).
import { collapseReplacer } from './collapseReplacer.js';

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

// Paint is a core animatable document value (§2.2) — a solid color or a
// linear/radial gradient, keyframeable via `paintType`. Backends switch on
// `kind`. Re-exported here as the IR fill/stroke paint the DrawCommands carry.
import type { Paint, ColorStop, MeshPaint, MeshPoint, MeshInterpolation } from '@glissade/core';
export type { Paint, ColorStop, MeshPaint, MeshPoint, MeshInterpolation };

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
  /**
   * Variable-font axis settings in CSS `font-variation-settings` form
   * (e.g. `'"wght" 700, "opsz" 14'`). 0.20 STATIC passthrough: applied on the
   * Skia/export path (`@napi-rs/canvas` exposes `ctx.fontVariationSettings`),
   * best-effort in the browser (the DOM 2D context has no such property — a
   * guarded no-op there). OMITTED for default Text, so a node without axes
   * emits a byte-identical FontSpec (the golden corpus depends on this).
   * Animatable axes (a `wght` track) are deferred to 1.0 — the string isn't
   * lerp-able, and a track targeting `<id>/fontVariationSettings` already
   * hard-throws `UnboundTargetError` (no signal resolves to it).
   */
  fontVariationSettings?: string;
  /**
   * Letter-spacing (tracking) in **px**, applied between glyphs. Maps 1:1 to
   * `ctx.letterSpacing` on the canvas/Skia path (both `@napi-rs/canvas` and the
   * modern browser 2D context honor it — and it affects `measureText`, so
   * wrapping stays correct) and to CSS `letter-spacing` on the DOM backend.
   * OMITTED for default Text, so a node without tracking emits a byte-identical
   * FontSpec (the golden corpus depends on this). For em-relative tracking pass
   * `em * fontSize` (px is the engine's unit everywhere else).
   */
  letterSpacing?: number;
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
  // RESERVED SEAM (§3 text shaping): a future `glyphRun` op — positioned glyph
  // runs (glyph ids + advances/offsets) produced by a harfbuzzjs shaper, for
  // complex-script / ligature-correct layout that `fillText` cannot express. The
  // shaper itself is OUT of v1; the variant's exact shape is left UNSPECIFIED on
  // purpose (adding it now would freeze an unvalidated 1.0-candidate API, force a
  // scene.api.md regen for dead surface, and require a no-op case in every
  // exhaustive backend / raster2d switch). Deferred to post-1.0 — this comment is
  // the reservation the spec calls for; no type or runtime surface is added.
  | { op: 'drawImage'; image: ResourceId; src?: Rect; dst: Rect; smoothing?: boolean }
  | {
      op: 'pushGroup';
      opacity: number;
      blend: BlendMode;
      filters: FilterSpec[];
      shader?: ShaderRef;
      cacheKey?: string;
      /**
       * 0.34 track-matte: this layer is a MATTE for the layer it composites
       * onto — 'alpha' keeps destination pixels where this layer is opaque
       * (native destination-in, byte-exact); 'luma' first converts this
       * layer's luminance to alpha via the shared straight-alpha CPU kernel
       * (the mesh-kernel discipline), then applies destination-in. Emitted
       * by trackMatte() inside its isolated outer group; an optional field
       * on the shader?/cacheKey? extension precedent — BlendMode stays a
       * closed union.
       */
      matte?: 'alpha' | 'luma';
    }
  | { op: 'popGroup' };

export interface DisplayList {
  commands: DrawCommand[];
  resources: Resource[];
  size: { w: number; h: number };
}

export interface DisplayListBuilder {
  push(cmd: DrawCommand): void;
  resource(res: Resource): ResourceId;
  /**
   * §3.5 cacheKey seam — OPTIONAL so non-cache emits and lightweight mock
   * builders never need them. `createDisplayListBuilder` supplies all three;
   * `Node.emit` calls them only for `cache:true` nodes when present.
   */
  /** Count of commands emitted so far — a markpoint for cacheKey ranges. */
  mark?(): number;
  /**
   * A stable hash of the command slice [start, end) plus the FULL content of
   * every resource those commands reference (not just ids — interned ids are a
   * per-list detail). Pure function of the slice; identical slices at two times
   * hash equal, so a static subtree caches. Opaque buffers collapse to a length
   * marker (mirrors cacheColdAudit's serializer). Undefined for an empty slice.
   */
  cacheKey?(start: number, end: number): string | undefined;
  /** Stamp a cacheKey onto the pushGroup already emitted at index `i`. */
  patchCacheKey?(i: number, key: string): void;
  /**
   * OUT-OF-BAND node-identity seam (S1, the DOM-backend readiness prerequisite —
   * see docs/design/dom-backend.md "Seam 1"). `Node.emit` announces the node it
   * is about to emit (`enterNode(this.id)`) and announces completion
   * (`exitNode()`) — a strictly LIFO pair around the whole save…restore slice,
   * so the instrumented builder can attribute each `push` to the emitting node
   * and produce a positional `NodeIdStream` ALONGSIDE the DisplayList, never
   * inside it. Both are OPTIONAL: the default `createDisplayListBuilder` does NOT
   * implement them, so `Node.emit`'s guarded `out.enterNode?.()` /
   * `out.exitNode?.()` calls are no-ops on the normal evaluate/render path and
   * every DrawCommand stays byte-identical (the 262-golden contract). Only the
   * opt-in `emitWithIds` builder (`@glissade/scene/identity`) supplies them.
   */
  enterNode?(id: string | undefined): void;
  exitNode?(): void;
}

/**
 * Resource ids that appear in a draw command — only path/image/video draws
 * carry one. Keeps the cacheKey serializer in lockstep with DrawCommand.
 */
function commandResourceIds(cmd: DrawCommand): number[] {
  switch (cmd.op) {
    case 'clip':
    case 'fillPath':
    case 'strokePath':
      return [cmd.path];
    case 'drawImage':
      return [cmd.image];
    default:
      return [];
  }
}

/** FNV-1a over a string → an 8-hex-digit stable token (no crypto dep, ESM-safe). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
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
    mark: () => commands.length,
    cacheKey: (start, end) => {
      if (end <= start) return undefined;
      // Serialize the slice, but inline each referenced resource's CONTENT so
      // the key reflects geometry/asset identity, not list-local interned ids.
      // A local id→ordinal remap makes the key invariant to where the resource
      // happens to land in the shared table (two structurally-identical slices
      // emitted in different orders still hash equal).
      const localIds = new Map<number, number>();
      const usedResources: Resource[] = [];
      const remap = (id: number): number => {
        let local = localIds.get(id);
        if (local === undefined) {
          local = localIds.size;
          localIds.set(id, local);
          usedResources.push(resources[id] as Resource);
        }
        return local;
      };
      const sliceCmds = commands.slice(start, end).map((cmd) => {
        const ids = commandResourceIds(cmd);
        if (ids.length === 0) return cmd;
        // shallow-clone with remapped ids; the original command is untouched
        if (cmd.op === 'drawImage') return { ...cmd, image: remap(cmd.image) };
        return { ...cmd, path: remap((cmd as { path: number }).path) };
      });
      // Shared byte-preserving collapse-replacer (displayDiff.ts) — MUST keep
      // the exact output the §3.5 raster cacheKey was built on.
      const payload = JSON.stringify({ c: sliceCmds, r: usedResources }, collapseReplacer);
      return fnv1a(payload);
    },
    patchCacheKey: (i, key) => {
      const cmd = commands[i];
      if (cmd && cmd.op === 'pushGroup') cmd.cacheKey = key;
    },
    finish: () => ({ commands, resources, size }),
  };
}

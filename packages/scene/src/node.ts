/**
 * Scene-graph node base (DESIGN.md §3.1): every animatable property is a
 * signal; transforms are computed matrix signals; emit() is pure — it reads
 * signals and ctx only, and produces IR commands, never canvas calls.
 */

import {
  computed,
  emitDevWarning,
  signal,
  vec2Signal,
  TARGET_PATH,
  type BindableSignal,
  type ReadonlySignal,
  type ValueTypeId,
  type Vec2,
  type Vec2Signal,
} from '@glissade/core';
import {
  type BlendMode,
  type DisplayListBuilder,
  type FilterSpec,
  type ShaderRef,
} from './displayList.js';
import { fallbackMeasurer, type TextMeasurer } from './text.js';
import { fromTRS, multiply, matEquals, IDENTITY, type Mat2x3 } from './matrix.js';
import { acceptedConstructionKeys } from './constructionProps.js';

/**
 * Where `position` pins to on the node's intrinsic box, as fractions of its
 * size — and the rotation/scale pivot (the Lottie anchor model). Default
 * 'center' preserves every pre-anchor scene byte-for-byte. With a non-center
 * anchor, grow direction falls out: anchor 'left' + a width track sweeps
 * rightward, anchor [0, 1] grows a bar upward.
 */
export type AnchorSpec =
  | 'center'
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'
  | readonly [number, number];

const ANCHOR_PRESETS: Record<string, Vec2> = {
  'center': [0.5, 0.5],
  'top-left': [0, 0],
  'top': [0.5, 0],
  'top-right': [1, 0],
  'left': [0, 0.5],
  'right': [1, 0.5],
  'bottom-left': [0, 1],
  'bottom': [0.5, 1],
  'bottom-right': [1, 1],
};

export function resolveAnchor(spec: AnchorSpec): Vec2 {
  if (typeof spec === 'string') {
    const preset = ANCHOR_PRESETS[spec];
    if (!preset) {
      throw new Error(`unknown anchor '${spec}' (use a preset like 'top-left' or a [ax, ay] pair)`);
    }
    return preset;
  }
  return [spec[0], spec[1]];
}

export interface EvalContext {
  /** The playhead value at evaluate() entry — the only time channel (§3.1). */
  readonly time: number;
  /** Derived: round(time * fps) when the timeline carries an fps advisory; -1 otherwise. */
  readonly frame: number;
  /** Injected by mount()/CLI/exporters (§3.2): the active backend's measurer. */
  readonly measurer: TextMeasurer;
}

/** A property initializer: a value, or a computed source (§2.1). */
export type PropInit<T> = T | (() => T);

export interface NodeProps {
  id?: string;
  position?: PropInit<Vec2>;
  rotation?: PropInit<number>;
  scale?: PropInit<Vec2>;
  opacity?: PropInit<number>;
  blend?: PropInit<BlendMode>;
  zIndex?: PropInit<number>;
  /** Group filters (§3.4): the subtree composites as a unit through them. */
  filters?: PropInit<FilterSpec[]>;
  /** Placement point + transform pivot on the intrinsic box; default 'center'. */
  anchor?: AnchorSpec;
  /**
   * §3.5 cross-frame raster cache: FORCE this subtree into a group and stamp a
   * cacheKey on its pushGroup, so a backend with the bitmap LRU re-blits an
   * unchanged subtree under a moving parent instead of re-rasterizing it. A
   * pure performance hint — semantics are byte-identical with the cache off
   * (the cache key folds in the inherited device transform, so a stale CTM can
   * never blit). OFF by default: a scene that never sets it emits ZERO extra
   * groups and is byte-identical to before. Best for expensive STATIC subtrees.
   *
   * CAVEAT (when it does NOT help): the key folds in the inherited device
   * transform, so a subtree that itself DRIFTS — e.g. animated on sub-pixel
   * float positions — misses the cache every frame; cache a static subtree
   * under a *moving parent*, not a subtree that moves itself. And a `filter`
   * is a LIVE composite parameter applied on the blit, never baked into the
   * cached bitmap, so `cache:true` on a filter-declaring (e.g. blurred) group
   * does not cache the filter cost. For per-frame-cheap drift, prefer
   * eliminating the work (a cheaper Paint/effect) over caching it.
   */
  cache?: boolean;
}

export interface BindablePropTarget {
  bindSource(fn: () => unknown): void;
  unbindSource(): void;
  /**
   * The value type(s) this prop accepts — bindTimeline hard-throws a mismatched
   * track (§2.2). An array for a GENUINELY polymorphic prop (a Shape `fill` is
   * color|paint — distinct reprs). A plain `vec2` prop tags just `'vec2'`: the
   * 0.15 repr-compat guard binds a `vec2-arc` track (repr 'vec2') to it without
   * an array tag. UNDEFINED for an untagged target (the 2-arg registerTarget
   * form): bindTimeline skips the guard (0.13 back-compat seam).
   */
  readonly expects: ValueTypeId | readonly ValueTypeId[] | undefined;
}

/** Node-local hit-shape override (v2 §C.3) — fat targets for thin strokes. */
export type HitArea =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; x: number; y: number; r: number };

function initScalar<T>(sig: BindableSignal<T>, init: PropInit<T> | undefined): BindableSignal<T> {
  if (typeof init === 'function') sig.bindSource(init as () => T);
  else if (init !== undefined) sig.set(init);
  return sig;
}

function initVec2(sig: Vec2Signal, init: PropInit<Vec2> | undefined): Vec2Signal {
  if (typeof init === 'function') sig.bindSource(init);
  else if (init !== undefined) sig.set(init);
  return sig;
}

/**
 * Thrown by a node constructor when it's passed an unknown prop key (the
 * construction-time sibling of the timeline builder's `TimelineValidationError`).
 * Names the offending key(s), the node type, and the valid props. See
 * {@link Node.checkProps}.
 */
export class NodeConstructionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeConstructionError';
  }
}

export abstract class Node {
  readonly id: string | undefined;
  readonly position: Vec2Signal;
  readonly rotation: BindableSignal<number>;
  readonly scale: Vec2Signal;
  readonly opacity: BindableSignal<number>;
  readonly blend: BindableSignal<BlendMode>;
  readonly zIndex: BindableSignal<number>;
  readonly filters: BindableSignal<FilterSpec[]>;
  /** Resolved anchor fraction over the intrinsic box; [0.5, 0.5] = center. */
  readonly anchor: Vec2;
  /** True only when the author SET an anchor — unset keeps the legacy origin. */
  readonly hasAnchor: boolean;
  /** §3.5: opt-in cross-frame raster cache. Forces a group + a stamped cacheKey. */
  readonly cache: boolean;

  parent: Node | null = null;
  #warnedAnchor = false;

  /** v2 §C.3: participates in hit testing; set implicitly by attaching a listener. */
  interactive = false;
  /** v2 §C.3: false prunes this subtree from hit testing (PixiJS's flag). */
  interactiveChildren = true;
  /** v2 §C.3: explicit hit-shape override in node-local coordinates. */
  hitArea: HitArea | undefined;

  /**
   * Injected by createScene: the scene's CURRENT TextMeasurer (§3.2), so
   * derived-size bindings (e.g. a background tracking Layout.computedSize)
   * measure with the same rasterizer the flow uses.
   */
  measurerSource: (() => TextMeasurer) | null = null;

  readonly localMatrix: ReadonlySignal<Mat2x3>;
  readonly worldMatrix: ReadonlySignal<Mat2x3>;

  /** Track-target paths → bindable signals; subclasses register their own props. */
  protected readonly targets = new Map<string, BindablePropTarget>();

  constructor(props: NodeProps = {}) {
    this.id = props.id;
    this.position = initVec2(vec2Signal([0, 0]), props.position);
    this.rotation = initScalar(signal(0), props.rotation);
    this.scale = initVec2(vec2Signal([1, 1]), props.scale);
    this.opacity = initScalar(signal(1), props.opacity);
    this.blend = initScalar(signal<BlendMode>('source-over'), props.blend);
    this.zIndex = initScalar(signal(0), props.zIndex);
    this.filters = initScalar(signal<FilterSpec[]>([]), props.filters);
    this.hasAnchor = props.anchor !== undefined;
    this.anchor = resolveAnchor(props.anchor ?? 'center');
    this.cache = props.cache === true;

    this.localMatrix = computed(
      () => {
        const trs = fromTRS(this.position(), this.rotation(), this.scale());
        const [sx, sy] = this.anchorShift();
        // the shift composes AFTER TRS, so the anchor is both the placement
        // point and the rotation/scale pivot
        return sx === 0 && sy === 0 ? trs : multiply(trs, [1, 0, 0, 1, sx, sy]);
      },
      { equals: matEquals },
    );
    this.worldMatrix = computed(
      () => (this.parent ? multiply(this.parent.worldMatrix(), this.localMatrix()) : this.localMatrix()),
      { equals: matEquals },
    );

    this.registerTarget('position', this.position, 'vec2');
    this.registerTarget('position.x', this.position.x, 'number');
    this.registerTarget('position.y', this.position.y, 'number');
    this.registerTarget('rotation', this.rotation, 'number');
    this.registerTarget('scale', this.scale, 'vec2');
    this.registerTarget('scale.x', this.scale.x, 'number');
    this.registerTarget('scale.y', this.scale.y, 'number');
    this.registerTarget('opacity', this.opacity, 'number');
    this.registerTarget('zIndex', this.zIndex, 'number');
  }

  /**
   * Register a track-target path → bindable signal, stamping the value type the
   * signal accepts (§2.2). The stamp is what bindTimeline's bind-time guard
   * reads to reject a mismatched track (a scalar on a vec2, a number on a paint
   * prop, …) instead of silently sampling to NaN/undefined.
   *
   * `expects` is OPTIONAL: omitting it (the 2-arg form) leaves the target
   * UNtagged — bindTimeline then skips the type guard for it, which is the
   * back-compat seam for external `Custom`/`Node` subclasses (DESIGN.md §329)
   * and prebuilt 0.13 nodes that called the 2-arg form (0.13 had no guard). A
   * built-in node opts INTO the guard by tagging.
   */
  protected registerTarget(
    path: string,
    sig: { bindSource(fn: () => unknown): void; unbindSource(): void },
    expects?: ValueTypeId | readonly ValueTypeId[],
  ): void {
    (sig as unknown as { expects: ValueTypeId | readonly ValueTypeId[] | undefined }).expects = expects;
    this.targets.set(path, sig as BindablePropTarget);
    // builder targets (§2.6): a prop signal of an id-bearing node carries its path
    if (this.id !== undefined) {
      (sig as unknown as Record<symbol, string>)[TARGET_PATH] = `${this.id}/${path}`;
    }
  }

  resolveTarget(path: string): BindablePropTarget | undefined {
    return this.targets.get(path);
  }

  /**
   * This node's DESCRIBE type name (e.g. `Image`, `Rect`) — the key the
   * construction-prop schema and `describe()` manifest use. Defaults to the
   * class name; `ImageNode` overrides it (its class name is `ImageNode`, but
   * the public taxonomy name is `Image`). Used by the bind guard to turn a
   * generic unbound-target error into a friendlier construction-prop message.
   */
  get describeType(): string {
    return this.constructor.name;
  }

  /**
   * Enumerate this node's registered track-target paths and the value type each
   * accepts — the introspection seam `describe()` reads to build the API
   * manifest from the REAL `registerTarget` calls (so it can't drift). Returns
   * `[path, expects]` pairs in registration order; `expects` is the §2.2 type
   * stamp (a `ValueTypeId`, an array for a polymorphic prop like `fill`, or
   * `undefined` for an untagged target).
   */
  listTargets(): { path: string; expects: ValueTypeId | readonly ValueTypeId[] | undefined }[] {
    return [...this.targets].map(([path, sig]) => ({ path, expects: sig.expects }));
  }

  /**
   * Fail-loud guard against UNKNOWN construction props — the sibling of the
   * timeline builder's unknown-option guard (`to(…, { eaze })` throws). Without
   * it a node silently drops a misnamed prop: `new Rect({ size:[80,80] })` keeps
   * width/height at 0 → an invisible node, no warning (a real footgun the docs
   * even shipped). Each BUILT-IN node calls this at the END of its constructor,
   * guarded by `new.target === <ThisClass>` so it runs ONLY for the exact leaf
   * type (an intermediate base like `Group` skips it when a `Layout` is being
   * constructed — `Layout` validates itself with its own fuller target set; and
   * user `Custom`/external subclasses, whose `new.target` matches no built-in,
   * are never validated, keeping that extension seam lenient).
   *
   * The allow-list is {@link acceptedConstructionKeys} — built from the live
   * `registerTarget` set + the construction-prop name sets, so it can't drift
   * from what the constructors actually honor. Must be called after the leaf has
   * registered all its targets (i.e. last), so the animatable keys are present.
   */
  protected checkProps(props: object): void {
    const accepted = acceptedConstructionKeys(this.describeType, this.targets.keys());
    let unknown: string[] | undefined;
    for (const k of Object.keys(props)) {
      if (!accepted.has(k)) (unknown ??= []).push(k);
    }
    if (unknown !== undefined) {
      const valid = [...accepted].sort().join(', ');
      throw new NodeConstructionError(
        `new ${this.describeType}({ … }): unknown construction ${unknown.length > 1 ? 'props' : 'prop'} ` +
          `${unknown.map((k) => `'${k}'`).join(', ')}. Valid ${this.describeType} props: ${valid}. ` +
          `(Animatable sub-paths like 'position.x' are timeline targets — to('<id>/position.x', …) — ` +
          `not construction keys; set the whole 'position' at construction.)`,
      );
    }
  }

  /** Subclass drawing: emit own commands (and children for containers). */
  protected abstract draw(out: DisplayListBuilder, ctx: EvalContext): void;

  /**
   * Natural size for flex flow (§3.2); null = not flowable (a Layout parent
   * emits such children absolutely, untouched).
   */
  intrinsicSize(measurer: TextMeasurer): { w: number; h: number } | null {
    void measurer;
    return null;
  }

  /**
   * Vector from the DRAW origin to the intrinsic box's top-left, in the
   * geometry space draw() emits into (anchor-independent — the anchor shift
   * lives in localMatrix). Hit testing boxes nodes with this. Default:
   * center-anchored geometry (every shape). Text overrides — it draws from a
   * left/center/right baseline origin; Path from author-positioned bounds.
   */
  drawOffset(measurer?: TextMeasurer): { x: number; y: number } {
    const m = measurer ?? this.measurerSource?.() ?? fallbackMeasurer();
    const size = this.intrinsicSize(m) ?? { w: 0, h: 0 };
    return { x: -size.w / 2, y: -size.h / 2 };
  }

  /**
   * Vector from the node ORIGIN (the point `position` places) to the box's
   * top-left, so Layout can place any node. With an anchor this is exactly
   * (−ax·w, −ay·h); the center default reproduces (−w/2, −h/2).
   */
  flowOffset(measurer?: TextMeasurer): { x: number; y: number } {
    const m = measurer ?? this.measurerSource?.() ?? fallbackMeasurer();
    const d = this.drawOffset(m);
    const [sx, sy] = this.anchorShift(m);
    return { x: d.x + sx, y: d.y + sy };
  }

  /**
   * Translation composed after TRS in localMatrix: moves the drawn box so the
   * anchor point lands on the origin. shift = −(drawOffset + anchor·size).
   * No anchor set → zero shift, the legacy origin (shape center / Text
   * baseline / Path author coords) — every pre-anchor scene is byte-stable.
   * An EXPLICIT anchor pins position to that fraction of the box, even
   * 'center' (which differs from the legacy origin only for Text and Path).
   * Nodes without an intrinsic box (Group) warn once and ignore it.
   */
  protected anchorShift(measurer?: TextMeasurer): Vec2 {
    if (!this.hasAnchor) return [0, 0];
    const [ax, ay] = this.anchor;
    const m = measurer ?? this.measurerSource?.() ?? fallbackMeasurer();
    const size = this.intrinsicSize(m);
    if (!size) {
      if (!this.#warnedAnchor) {
        this.#warnedAnchor = true;
        emitDevWarning(
          `anchor set on a node without an intrinsic box${this.id ? ` ('${this.id}')` : ''} — ignored (give it a sized node, or position children explicitly)`,
        );
      }
      return [0, 0];
    }
    const d = this.drawOffset(m);
    const sx = -(d.x + ax * size.w);
    const sy = -(d.y + ay * size.h);
    return [sx === 0 ? 0 : sx, sy === 0 ? 0 : sy];
  }

  /** §3.5 predicate: composite-as-a-unit when opacity/blend/filters demand it. */
  protected requiresGroup(): boolean {
    return this.opacity() < 1 || this.blend() !== 'source-over' || this.filters().length > 0;
  }

  /** §3.7: a subtree-level shader pass; ShaderEffect overrides. */
  protected groupShader(): ShaderRef | undefined {
    return undefined;
  }

  emit(out: DisplayListBuilder, ctx: EvalContext): void {
    const opacity = this.opacity();
    if (opacity <= 0) return;
    const local = this.localMatrix();
    const isIdentity = matEquals(local, IDENTITY);
    const shader = this.groupShader();
    // §3.5: `cache:true` FORCES a group even when nothing else demands one, so a
    // plain static subtree (opacity 1 / source-over / no filter) is cacheable.
    // Strictly gated: without `cache:true` the group set is unchanged, so every
    // pre-existing scene emits identical IR and every golden stays byte-stable.
    const group = this.requiresGroup() || shader !== undefined || this.cache;
    // §3.5 cacheKey ride-along: only `cache:true` nodes use the builder's
    // mark/cacheKey/patchCacheKey seam. Those are optional on the interface so
    // non-cache emits (and the lightweight mock builders in tests) never touch
    // them — preserving byte-identity and back-compat for every other node.
    const wantsKey = this.cache && out.mark !== undefined;
    // S1 out-of-band identity (off by default): announce the emitting node so an
    // instrumented builder can attribute every `push` below to `this`. A no-op
    // on the normal path — `createDisplayListBuilder` omits enterNode/exitNode,
    // so every DrawCommand stays byte-identical. See displayList.ts "Seam 1".
    out.enterNode?.(this.id);
    out.push({ op: 'save' });
    if (!isIdentity) out.push({ op: 'transform', m: local });
    // Mark BEFORE pushGroup so the cacheKey covers exactly the draw() slice
    // (the group's children), not the pushGroup itself — the LRU re-composites
    // with this node's live opacity/blend/filter, so those stay out of the key.
    let pushIdx = -1;
    if (group) {
      if (wantsKey) pushIdx = out.mark!();
      out.push({
        op: 'pushGroup',
        opacity,
        blend: this.blend(),
        filters: this.filters(),
        ...(shader !== undefined ? { shader } : {}),
      });
    }
    const drawStart = wantsKey ? out.mark!() : -1;
    this.draw(out, ctx);
    if (group) {
      if (wantsKey) {
        const key = out.cacheKey!(drawStart, out.mark!());
        // back-patch the cacheKey onto the pushGroup now that the slice exists
        if (key !== undefined) out.patchCacheKey!(pushIdx, key);
      }
      out.push({ op: 'popGroup' });
    }
    out.push({ op: 'restore' });
    out.exitNode?.();
  }
}

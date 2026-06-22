/**
 * '@glissade/scene/layout-ctors' (DESIGN.md §3.2): the YOGA-FREE flexbox node
 * constructors — `Layout`/`Stack`/`Row`/`Column`. These classes only touch the
 * LayoutEngine SEAM (`requireLayoutEngine`/`setLayoutEngine`) at COMPUTE time;
 * they never import Yoga at construction. Splitting them off the loader
 * (`loadYogaLayoutEngine`, which statically reaches `yoga-layout/load`) lets the
 * single-file `@glissade/browser` IIFE expose `Stack`/`Row`/`Column`/`Layout`
 * WITHOUT inlining Yoga's wasm — esbuild's IIFE format can't keep the loader's
 * `import('yoga-layout/load')` async, so it would balloon the bundle (~47→~99 kB
 * gz). The ctors here carry no such import, so they ride the IIFE cleanly.
 *
 * CAVEAT (the no-build cost of the split): a ctor on the IIFE needs an engine
 * registered before it computes. Call `await glissade.loadYogaLayoutEngine()`
 * once before evaluating a scene with a Layout/Stack/Row/Column node, else the
 * first compute throws a clear `LayoutEngineMissingError`.
 *
 * The `@glissade/scene/layout` entry re-exports everything here PLUS the loader,
 * so existing `@glissade/scene/layout` importers are unaffected.
 */

import { computed, signal, type BindableSignal, type ReadonlySignal } from '@glissade/core';
import { type DisplayListBuilder } from './displayList.js';
import { Node, type EvalContext, type NodeProps, type PropInit } from './node.js';
import { Group } from './nodes.js';
import { fallbackMeasurer, type TextMeasurer } from './text.js';
import {
  requireLayoutEngine,
  type LayoutChildSpec,
  type LayoutContainerSpec,
  type LayoutResult,
} from './layoutEngine.js';

export interface LayoutProps extends NodeProps {
  children?: Node[];
  /** 'auto': the axis sizes itself from content (Yoga content sizing). */
  width?: PropInit<number> | 'auto';
  height?: PropInit<number> | 'auto';
  direction?: 'row' | 'column';
  gap?: PropInit<number>;
  padding?: PropInit<number>;
  justify?: LayoutContainerSpec['justify'];
  align?: LayoutContainerSpec['align'];
}

/**
 * Flexbox container (center-anchored like every node). Flowable children
 * (intrinsicSize ≠ null) are placed by the engine anchor-aware via
 * flowOffset(): shapes center into their box, Text aligns its baseline
 * origin to the box edge — labels in a column share a true left edge.
 * Non-flowable children (e.g. Groups) emit untouched at the layout origin,
 * BEFORE the flow — their dominant use is backgrounds. Flowed paint order is
 * zIndex-sorted; flow order is array order.
 */
export class Layout extends Group {
  /** CLI/host detection marker — avoids importing this entry just to instanceof. */
  static readonly isLayoutNode = true;
  readonly width: BindableSignal<number>;
  readonly height: BindableSignal<number>;
  readonly gap: BindableSignal<number>;
  readonly padding: BindableSignal<number>;
  readonly direction: 'row' | 'column';
  readonly justify: LayoutContainerSpec['justify'];
  readonly align: LayoutContainerSpec['align'];

  /** Content-sized axes ('auto'): the size signal is ignored, Yoga computes it. */
  readonly autoWidth: boolean;
  readonly autoHeight: boolean;

  /**
   * Sanctioned memoization (§2.1), core-`computed()`-backed: a pure function of
   * the PARTICIPATING signals. The compute reads exactly the container props
   * and child intrinsic-size signals it consumes, so the signal graph records
   * those as deps and re-invokes Yoga only when one of THEM changes — a sibling
   * mutating a non-participating signal does not invalidate the layout. Pulls
   * the scene-injected measurer (the same one draw() uses via ctx.measurer);
   * a caller-supplied non-default measurer bypasses this cache (see #compute).
   */
  readonly #memo: ReadonlySignal<{
    result: LayoutResult;
    size: { w: number; h: number };
    flowable: { node: Node; spec: LayoutChildSpec; index: number }[];
    absolute: Node[];
  }> = computed(() =>
    this.#computeUncached(this.measurerSource?.() ?? fallbackMeasurer()),
  );

  constructor(props: LayoutProps = {}) {
    super(props);
    this.autoWidth = props.width === 'auto';
    this.autoHeight = props.height === 'auto';
    this.width = initProp(signal(0), this.autoWidth ? undefined : (props.width as PropInit<number> | undefined));
    this.height = initProp(signal(0), this.autoHeight ? undefined : (props.height as PropInit<number> | undefined));
    this.gap = initProp(signal(0), props.gap);
    this.padding = initProp(signal(0), props.padding);
    this.direction = props.direction ?? 'row';
    this.justify = props.justify ?? 'start';
    this.align = props.align ?? 'center';
    this.registerTarget('width', this.width, 'number');
    this.registerTarget('height', this.height, 'number');
    this.registerTarget('gap', this.gap, 'number');
    this.registerTarget('padding', this.padding, 'number');
  }

  override intrinsicSize(measurer: TextMeasurer): { w: number; h: number } {
    // fixed axes never need the engine (back-compat); auto axes resolve from content
    if (!this.autoWidth && !this.autoHeight) return { w: this.width(), h: this.height() };
    return this.#compute(measurer).size;
  }

  /**
   * The resolved container size — content-driven on 'auto' axes. Pure pull:
   * reads the same signals the flow reads, so a sibling bound to it
   * (e.g. panelBg height = () => panel.computedSize().h) tracks every input.
   * The measurer defaults to the scene-injected one (estimating pre-scene).
   */
  computedSize(measurer?: TextMeasurer): { w: number; h: number } {
    const m = measurer ?? this.measurerSource?.() ?? fallbackMeasurer();
    return this.#compute(m).size;
  }

  /**
   * Route through the #memo (the dependency-tracked computed) when `measurer`
   * is the default the memo itself pulls; otherwise compute fresh & UNCACHED —
   * a caller-supplied non-default measurer must never read (or poison) a cache
   * keyed on the scene-singleton measurer (the `computedSize(customMeasurer)`
   * escape hatch).
   */
  #compute(measurer: TextMeasurer): {
    result: LayoutResult;
    size: { w: number; h: number };
    flowable: { node: Node; spec: LayoutChildSpec; index: number }[];
    absolute: Node[];
  } {
    const isDefault = measurer === (this.measurerSource?.() ?? fallbackMeasurer());
    return isDefault ? this.#memo() : this.#computeUncached(measurer);
  }

  #computeUncached(measurer: TextMeasurer): {
    result: LayoutResult;
    /** Spec-exact on fixed axes (Yoga rounds computed values — goldens are byte-exact); computed on 'auto'. */
    size: { w: number; h: number };
    flowable: { node: Node; spec: LayoutChildSpec; index: number }[];
    absolute: Node[];
  } {
    const container: LayoutContainerSpec = {
      width: this.autoWidth ? 'auto' : this.width(),
      height: this.autoHeight ? 'auto' : this.height(),
      direction: this.direction,
      gap: this.gap(),
      padding: this.padding(),
      justify: this.justify,
      align: this.align,
    };
    // a child add/remove changes the layout but bumps no prop signal — track
    // the structural version so the memo re-runs on a child-set mutation too
    this.trackStructure();
    const flowable: { node: Node; spec: LayoutChildSpec; index: number }[] = [];
    const absolute: Node[] = [];
    this.children.forEach((child, index) => {
      const size = child.intrinsicSize(measurer);
      if (size) flowable.push({ node: child, spec: { width: size.w, height: size.h }, index });
      else absolute.push(child);
    });

    const result = requireLayoutEngine().compute(
      container,
      flowable.map((f) => f.spec),
    );
    const size = {
      w: this.autoWidth ? result.width : (container.width as number),
      h: this.autoHeight ? result.height : (container.height as number),
    };
    return { result, size, flowable, absolute };
  }

  protected override draw(out: DisplayListBuilder, ctx: EvalContext): void {
    const { result, size, flowable, absolute } = this.#compute(ctx.measurer);
    const boxes = result.boxes;

    // paint zIndex-sorted; positions come from flow (array) order
    const order = [...flowable].sort(
      (a, b) => a.node.zIndex() - b.node.zIndex() || a.index - b.index,
    );
    const ox = -size.w / 2;
    const oy = -size.h / 2;
    // absolute children first: their dominant use is backgrounds under the flow
    for (const child of absolute) child.emit(out, ctx);
    for (const entry of order) {
      const box = boxes[flowable.indexOf(entry)]!;
      // anchor-aware: node origin = box top-left minus the node's own offset
      // (shapes are center-anchored; Text origins sit at the baseline/edge)
      const off = entry.node.flowOffset(ctx.measurer);
      out.push({ op: 'save' });
      out.push({
        op: 'transform',
        m: [1, 0, 0, 1, ox + box.x - off.x, oy + box.y - off.y],
      });
      entry.node.emit(out, ctx);
      out.push({ op: 'restore' });
    }
  }
}

/**
 * Stack-ergonomic props — a more DISCOVERABLE surface over {@link LayoutProps}.
 * Everything `Layout` accepts (id, position, opacity, width/height, gap,
 * padding, justify, children, …) passes through unchanged; the only difference
 * from constructing `Layout` directly is the defaulting `Stack()` applies.
 */
export interface StackProps extends LayoutProps {}

/**
 * Thin convenience factory over the Yoga-backed {@link Layout} node — NOT a new
 * class and NOT new signals, so a `Stack` inherits Layout's memoized, pure,
 * dependency-tracked resolve verbatim: `Stack(props)` and the equivalent
 * hand-written `Layout({...})` produce identical child positions.
 *
 * Stack-ergonomic defaults (the ONLY divergence from `Layout`):
 * - `direction` defaults to `'column'` (the common vertical stack; Layout's own
 *   default is `'row'`).
 * - `align` defaults to `'start'` — a true left edge for a label column (the
 *   dogfooding use case). This DIVERGES from `Layout`'s `'center'` default.
 *
 * Every other prop passes straight through to `Layout`.
 */
export function Stack(props: StackProps = {}): Layout {
  return new Layout({
    ...props,
    direction: props.direction ?? 'column',
    align: props.align ?? 'start',
  });
}

/**
 * `Row`/`Column` props — `Stack`'s surface MINUS `direction` (the alias pins it).
 * Omitting `direction` from the type means an explicit one can't even be passed,
 * so `Row({...})` is unambiguously a row and `Column({...})` a column.
 */
export interface RowProps extends Omit<StackProps, 'direction'> {}

/**
 * `Stack({ direction: 'row' })` read as a name — a horizontal stack. Inherits
 * Stack's `align:'start'` default and Layout's pure memoized resolve; the only
 * difference from `Stack` is the pinned `direction`.
 */
export function Row(props: RowProps = {}): Layout {
  return Stack({ ...props, direction: 'row' });
}

/**
 * `Stack({ direction: 'column' })` read as a name — a vertical stack (the same
 * direction `Stack` already defaults to, made explicit at the call site).
 */
export function Column(props: RowProps = {}): Layout {
  return Stack({ ...props, direction: 'column' });
}

function initProp<T>(sig: BindableSignal<T>, init: PropInit<T> | undefined): BindableSignal<T> {
  if (typeof init === 'function') sig.bindSource(init as () => T);
  else if (init !== undefined) sig.set(init);
  return sig;
}

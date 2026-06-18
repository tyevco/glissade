/**
 * '@glissade/scene/layout' (DESIGN.md §3.2): the flexbox Layout node and the
 * Yoga-backed LayoutEngine. A SEPARATE entry point with its own budget — the
 * base embed path never pays for the wasm. Determinism: the same Yoga build
 * computes layout in browser preview and headless export.
 *
 * Usage: `await loadYogaLayoutEngine()` once before mounting/rendering a
 * scene containing Layout nodes (the CLI does this automatically).
 */

import { computed, signal, type BindableSignal, type ReadonlySignal } from '@glissade/core';
import { type DisplayListBuilder } from './displayList.js';
import { Node, type EvalContext, type NodeProps, type PropInit } from './node.js';
import { Group } from './nodes.js';
import { fallbackMeasurer, type TextMeasurer } from './text.js';
import {
  requireLayoutEngine,
  setLayoutEngine,
  type LayoutChildSpec,
  type LayoutContainerSpec,
  type LayoutEngine,
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
    this.registerTarget('width', this.width);
    this.registerTarget('height', this.height);
    this.registerTarget('gap', this.gap);
    this.registerTarget('padding', this.padding);
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

function initProp<T>(sig: BindableSignal<T>, init: PropInit<T> | undefined): BindableSignal<T> {
  if (typeof init === 'function') sig.bindSource(init as () => T);
  else if (init !== undefined) sig.set(init);
  return sig;
}

/** Load Yoga (wasm) and register it as the active LayoutEngine. Idempotent. */
export async function loadYogaLayoutEngine(): Promise<LayoutEngine> {
  const { loadYoga, FlexDirection, Justify, Align, Gutter, Edge, Direction } = await import(
    'yoga-layout/load'
  );
  const yoga = await loadYoga();

  const JUSTIFY = {
    start: Justify.FlexStart,
    center: Justify.Center,
    end: Justify.FlexEnd,
    'space-between': Justify.SpaceBetween,
    'space-around': Justify.SpaceAround,
  } as const;
  const ALIGN = {
    start: Align.FlexStart,
    center: Align.Center,
    end: Align.FlexEnd,
    stretch: Align.Stretch,
  } as const;

  const engine: LayoutEngine = {
    compute(container, children) {
      const root = yoga.Node.create();
      try {
        // 'auto' axes: leave the dimension unset so Yoga sizes from content
        if (container.width !== 'auto') root.setWidth(container.width);
        if (container.height !== 'auto') root.setHeight(container.height);
        root.setFlexDirection(
          container.direction === 'row' ? FlexDirection.Row : FlexDirection.Column,
        );
        root.setGap(Gutter.All, container.gap);
        root.setPadding(Edge.All, container.padding);
        root.setJustifyContent(JUSTIFY[container.justify]);
        root.setAlignItems(ALIGN[container.align]);
        for (let i = 0; i < children.length; i++) {
          const child = yoga.Node.create();
          child.setWidth(children[i]!.width);
          child.setHeight(children[i]!.height);
          if (children[i]!.grow !== undefined) child.setFlexGrow(children[i]!.grow!);
          if (children[i]!.margin !== undefined) child.setMargin(Edge.All, children[i]!.margin!);
          root.insertChild(child, i);
        }
        root.calculateLayout(
          container.width === 'auto' ? undefined : container.width,
          container.height === 'auto' ? undefined : container.height,
          Direction.LTR,
        );
        const result: LayoutResult = {
          width: root.getComputedWidth(),
          height: root.getComputedHeight(),
          boxes: [],
        };
        for (let i = 0; i < children.length; i++) {
          const child = root.getChild(i);
          result.boxes.push({
            x: child.getComputedLeft(),
            y: child.getComputedTop(),
            width: child.getComputedWidth(),
            height: child.getComputedHeight(),
          });
        }
        return result;
      } finally {
        root.freeRecursive();
      }
    },
  };
  setLayoutEngine(engine);
  return engine;
}

export {
  setLayoutEngine,
  getLayoutEngine,
  LayoutEngineMissingError,
  type LayoutEngine,
  type LayoutBox,
  type LayoutChildSpec,
  type LayoutContainerSpec,
  type LayoutResult,
} from './layoutEngine.js';

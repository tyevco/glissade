/**
 * '@glissade/scene/layout' (DESIGN.md §3.2): the flexbox Layout node and the
 * Yoga-backed LayoutEngine. A SEPARATE entry point with its own budget — the
 * base embed path never pays for the wasm. Determinism: the same Yoga build
 * computes layout in browser preview and headless export.
 *
 * Usage: `await loadYogaLayoutEngine()` once before mounting/rendering a
 * scene containing Layout nodes (the CLI does this automatically).
 */

import { signal, type BindableSignal } from '@glissade/core';
import { type DisplayListBuilder } from './displayList.js';
import { Node, type EvalContext, type NodeProps, type PropInit } from './node.js';
import { Group } from './nodes.js';
import {
  requireLayoutEngine,
  setLayoutEngine,
  type LayoutBox,
  type LayoutChildSpec,
  type LayoutContainerSpec,
  type LayoutEngine,
} from './layoutEngine.js';

export interface LayoutProps extends NodeProps {
  children?: Node[];
  width?: PropInit<number>;
  height?: PropInit<number>;
  direction?: 'row' | 'column';
  gap?: PropInit<number>;
  padding?: PropInit<number>;
  justify?: LayoutContainerSpec['justify'];
  align?: LayoutContainerSpec['align'];
}

/**
 * Flexbox container (center-anchored like every node). Flowable children
 * (intrinsicSize ≠ null) are placed by the engine — each child's center lands
 * in its box center, with the child's own transform applying on top.
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

  // sanctioned memoization (§2.1): pure function of the fingerprinted inputs
  #memoKey = '';
  #memoBoxes: LayoutBox[] = [];

  constructor(props: LayoutProps = {}) {
    super(props);
    this.width = initProp(signal(0), props.width);
    this.height = initProp(signal(0), props.height);
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

  override intrinsicSize(): { w: number; h: number } {
    return { w: this.width(), h: this.height() };
  }

  protected override draw(out: DisplayListBuilder, ctx: EvalContext): void {
    const container: LayoutContainerSpec = {
      width: this.width(),
      height: this.height(),
      direction: this.direction,
      gap: this.gap(),
      padding: this.padding(),
      justify: this.justify,
      align: this.align,
    };
    const flowable: { node: Node; spec: LayoutChildSpec; index: number }[] = [];
    const absolute: Node[] = [];
    this.children.forEach((child, index) => {
      const size = child.intrinsicSize(ctx.measurer);
      if (size) flowable.push({ node: child, spec: { width: size.w, height: size.h }, index });
      else absolute.push(child);
    });

    const key = JSON.stringify([container, flowable.map((f) => f.spec)]);
    if (key !== this.#memoKey) {
      this.#memoBoxes = requireLayoutEngine().compute(
        container,
        flowable.map((f) => f.spec),
      );
      this.#memoKey = key;
    }
    const boxes = this.#memoBoxes;

    // paint zIndex-sorted; positions come from flow (array) order
    const order = [...flowable].sort(
      (a, b) => a.node.zIndex() - b.node.zIndex() || a.index - b.index,
    );
    const ox = -container.width / 2;
    const oy = -container.height / 2;
    // absolute children first: their dominant use is backgrounds under the flow
    for (const child of absolute) child.emit(out, ctx);
    for (const entry of order) {
      const box = boxes[flowable.indexOf(entry)]!;
      out.push({ op: 'save' });
      out.push({
        op: 'transform',
        m: [1, 0, 0, 1, ox + box.x + box.width / 2, oy + box.y + box.height / 2],
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
        root.setWidth(container.width);
        root.setHeight(container.height);
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
        root.calculateLayout(container.width, container.height, Direction.LTR);
        const boxes: LayoutBox[] = [];
        for (let i = 0; i < children.length; i++) {
          const child = root.getChild(i);
          boxes.push({
            x: child.getComputedLeft(),
            y: child.getComputedTop(),
            width: child.getComputedWidth(),
            height: child.getComputedHeight(),
          });
        }
        return boxes;
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
} from './layoutEngine.js';

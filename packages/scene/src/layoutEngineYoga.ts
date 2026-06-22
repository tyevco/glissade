/**
 * The Yoga LayoutEngine LOADER (DESIGN.md §3.2). Split off the node ctors
 * (`layoutCtors.ts`) so the ctors can ride the single-file IIFE without dragging
 * Yoga's wasm: this module's `import('yoga-layout/load')` is what statically
 * inlines the wasm-base64 binding under esbuild's IIFE format (no code-splitting
 * keeps the dynamic import async). `@glissade/scene/layout` re-exports it, so
 * existing importers are unaffected; the IIFE re-exports it too but externalizes
 * `yoga-layout/load`, keeping the dynamic import a RUNTIME fetch (yoga stays out
 * of the bundle).
 */

import {
  setLayoutEngine,
  type LayoutEngine,
  type LayoutResult,
} from './layoutEngine.js';

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

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

/** Options for {@link loadYogaLayoutEngine}. */
export interface LoadYogaOptions {
  /**
   * Override the module specifier the loader dynamic-imports for `yoga-layout`.
   *
   * The default (`undefined`) imports the bare `'yoga-layout/load'` specifier —
   * correct under npm / a bundler / an import map, where the resolver finds the
   * package. But in the **no-build `@glissade/browser` IIFE** there is no
   * resolver, so a bare specifier throws *"Module name, 'yoga-layout/load' does
   * not resolve to a valid URL."* — the headline no-build layout feature can't
   * self-load. Pass a CDN ESM URL to resolve it without an import map, e.g.
   *
   * ```js
   * await glissade.loadYogaLayoutEngine({ url: 'https://esm.sh/yoga-layout@3.2.1/load' });
   * ```
   *
   * (Or register an `<script type="importmap">` mapping `yoga-layout/load` to
   * that URL and call with no argument — see `docs/layout.md`.)
   */
  url?: string;
}

/** Load Yoga (wasm) and register it as the active LayoutEngine. Idempotent. */
export async function loadYogaLayoutEngine(opts?: LoadYogaOptions): Promise<LayoutEngine> {
  // Two distinct dynamic imports, NOT `import(opts?.url ?? 'yoga-layout/load')`:
  // keeping the bare specifier a LITERAL preserves esbuild's externalize +
  // tsdown's runtime-import handling of the default path byte-for-byte (a
  // computed specifier would perturb both). The URL branch is a computed import
  // esbuild/rollup leave as a runtime `import()` — exactly right for a CDN URL.
  const mod = opts?.url
    ? await import(/* @vite-ignore */ /* webpackIgnore: true */ opts.url)
    : await import('yoga-layout/load');
  const { loadYoga, FlexDirection, Justify, Align, Gutter, Edge, Direction } = mod;
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

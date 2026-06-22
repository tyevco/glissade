/**
 * '@glissade/scene/layout' (DESIGN.md §3.2): the full flexbox surface — the
 * Yoga-free node ctors (`Layout`/`Stack`/`Row`/`Column`) PLUS the Yoga-backed
 * `loadYogaLayoutEngine`. A SEPARATE entry point with its own budget — the base
 * embed path never pays for the wasm. Determinism: the same Yoga build computes
 * layout in browser preview and headless export.
 *
 * Usage: `await loadYogaLayoutEngine()` once before mounting/rendering a
 * scene containing Layout nodes (the CLI does this automatically).
 *
 * 0.20 SPLIT: the node ctors moved to `layoutCtors.ts` (Yoga-free, the new
 * `@glissade/scene/layout-ctors` subpath) and the loader to
 * `layoutEngineYoga.ts`, so the single-file IIFE can expose Stack/Row/Column
 * WITHOUT inlining Yoga (esbuild's IIFE format can't keep the loader's
 * `import('yoga-layout/load')` async). This entry re-exports BOTH, so every
 * existing `@glissade/scene/layout` importer (incl. `loadYogaLayoutEngine`) is
 * unaffected — it just additionally pulls Yoga (this entry's 55 kB budget).
 */

export {
  Layout,
  Stack,
  Row,
  Column,
  type LayoutProps,
  type StackProps,
  type RowProps,
} from './layoutCtors.js';

export { loadYogaLayoutEngine } from './layoutEngineYoga.js';

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

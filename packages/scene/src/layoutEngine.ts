/**
 * The LayoutEngine seam (DESIGN.md §3.2): determinism demands the SAME layout
 * engine in browser preview and headless export, so layout never delegates to
 * the platform. Yoga implements this interface in the separately-budgeted
 * '@glissade/scene/layout' entry; the seam keeps Taffy adoptable later and
 * the base embed path free of wasm.
 */

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutChildSpec {
  width: number;
  height: number;
  grow?: number;
  margin?: number;
}

export interface LayoutContainerSpec {
  width: number;
  height: number;
  direction: 'row' | 'column';
  gap: number;
  padding: number;
  justify: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
  align: 'start' | 'center' | 'end' | 'stretch';
}

export interface LayoutEngine {
  /** Pure: child boxes (top-left relative to the container's top-left). */
  compute(container: LayoutContainerSpec, children: LayoutChildSpec[]): LayoutBox[];
}

export class LayoutEngineMissingError extends Error {
  constructor() {
    super(
      'a Layout node was evaluated but no LayoutEngine is registered — ' +
        "await loadYogaLayoutEngine() from '@glissade/scene/layout' before mounting/rendering " +
        '(the engine is wasm and loads async; evaluate() never awaits, §2.5)',
    );
    this.name = 'LayoutEngineMissingError';
  }
}

let engine: LayoutEngine | null = null;

export function setLayoutEngine(e: LayoutEngine): void {
  engine = e;
}

export function getLayoutEngine(): LayoutEngine | null {
  return engine;
}

export function requireLayoutEngine(): LayoutEngine {
  if (!engine) throw new LayoutEngineMissingError();
  return engine;
}

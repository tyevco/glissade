/**
 * Vite HMR glue for a mounted embed (DESIGN.md §4.3). When the scene module is
 * edited, the dev server hands us the re-evaluated module; we hot-swap the live
 * Mounted without losing the playhead (see Mounted.swap / Player.swap). The
 * consumer owns the dependency path (only they know it), so this returns the
 * accept callback rather than calling `import.meta.hot.accept` itself:
 *
 *   import * as sceneMod from './hero.scene';
 *   const mounted = mount(sceneMod.createScene(), sceneMod.timeline, canvas);
 *   import.meta.hot?.accept(
 *     './hero.scene',
 *     swapOnHmr(mounted, sceneMod.timeline, (m) => ({ scene: m.createScene(), timeline: m.timeline })),
 *   );
 *
 * It also warns when an edit removes a label the previous timeline declared —
 * code that seeks to that label (`play({ range: [labels.x, …] })`) would break.
 */

import { compileTimeline, type Timeline } from '@glissade/core';
import type { Scene } from '@glissade/scene';
import type { Mounted } from './mount.js';

export interface SceneModuleShape {
  scene?: Scene;
  timeline: Timeline;
}

/**
 * Build the `import.meta.hot.accept` callback that hot-swaps `mounted` from a
 * re-evaluated scene module. `rerun` maps the updated module namespace to the
 * fresh `{ scene?, timeline }`.
 */
export function swapOnHmr(
  mounted: Mounted,
  initialTimeline: Timeline,
  rerun: (mod: Record<string, unknown>) => SceneModuleShape,
): (mod: Record<string, unknown> | undefined) => void {
  let prevLabels = Object.keys(compileTimeline(initialTimeline).labels);
  return (mod) => {
    if (mod == null) return; // a broken edit — vite will fall back to a full reload
    const next = rerun(mod);
    const nextLabels = Object.keys(compileTimeline(next.timeline).labels);
    const dropped = prevLabels.filter((l) => !nextLabels.includes(l));
    if (dropped.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[glissade] HMR: this edit removed label(s) ${dropped.map((l) => `'${l}'`).join(', ')} — ` +
          'anything seeking to them will no longer resolve',
      );
    }
    prevLabels = nextLabels;
    mounted.swap(next);
  };
}

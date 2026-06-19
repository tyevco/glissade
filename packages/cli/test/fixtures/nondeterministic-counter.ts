/**
 * A DELIBERATELY non-deterministic scene fixture for `gs verify-determinism`.
 *
 * The 'drift' node's x reads a MODULE-LEVEL counter that increments every time
 * the prop recomputes — cross-frame accumulation (§5.5 item 5), the impurity the
 * determinism guards DON'T catch (it's not a clock/random/timer). The prop also
 * reads the node's own per-frame `opacity` signal (driven by a timeline track) so
 * the computed RE-RUNS every frame — that is what makes the counter accumulate
 * frame-by-frame instead of caching a single value.
 *
 * A linear render evaluates frames in order from the range start, so the counter
 * climbs 0,1,2,…; an N-shard render re-runs the module fresh per shard, so each
 * shard restarts the counter at its sub-range origin. The same frame index then
 * sees a DIFFERENT counter value across the two → the manifests diverge, and the
 * divergence localizes to node 'drift' (its position transform). 'anchor' is pure
 * — the sub-hash locator must finger 'drift', not 'anchor'.
 */

import { key, timeline, track } from '@glissade/core';
import { Circle, createScene, type SceneModule } from '@glissade/scene';

let pulls = 0;

const mod: SceneModule = {
  createScene: () => {
    const drift = new Circle({ id: 'drift', radius: 6, position: [16, 48], fill: '#f00' });
    // x depends on (a) the per-frame opacity (forces a recompute each frame) and
    // (b) a module-level counter (the impurity). The opacity read is the dep that
    // makes the computed re-run; the counter is what breaks determinism.
    drift.position.x.bindSource(() => {
      void drift.rotation(); // dependency → recompute every frame (geometry-only)
      pulls += 1;
      return 8 + (pulls % 16);
    });
    return createScene({
      size: { w: 64, h: 64 },
      children: [new Circle({ id: 'anchor', radius: 6, position: [16, 16], fill: '#0f0' }), drift],
    });
  },
  timeline: timeline({
    duration: 0.5,
    fps: 8,
    // animate drift's rotation so its x-computed (which reads rotation) re-runs
    // each frame. Rotation only changes the transform MATRIX — no opacity group
    // wrapper — so the divergence shows cleanly as a transform `m` field change.
    tracks: [track('drift/rotation', 'number', [key(0, 0), key(0.5, 1)])],
  }),
};

export default mod;

/**
 * gs build (0.29): the content-graph staleness planner — the pure heart of the DAG
 * runner. The pipeline per scene is linear (narrate → sfx → measure-loudness →
 * render) and each step's inputs INCLUDE its upstream's outputs, so staleness
 * propagates by content hashing: change a scene's narration and its sfx / loudness
 * / render all go stale in turn. A step runs when
 *   (a) an upstream step in the same scene is (re-)running this build — its output
 *       will change, so this pre-run hash can't yet see it; propagate explicitly; or
 *   (b) its output is missing; or
 *   (c) it was never built (no recorded input hash); or
 *   (d) its recorded input hash differs from the current one (inputs changed).
 * Otherwise it's FRESH and skipped. Pure + deterministic — `gs build --explain`
 * prints exactly this plan without running anything.
 */

export type BuildStep = 'narrate' | 'sfx' | 'measure-loudness' | 'render';

/** The canonical order; a scene runs the subset that applies to it. */
export const PIPELINE: readonly BuildStep[] = ['narrate', 'sfx', 'measure-loudness', 'render'];

export interface StepPlan {
  scene: string;
  step: BuildStep;
  action: 'run' | 'skip';
  reason: 'upstream re-ran' | 'output missing' | 'never built' | 'inputs changed' | 'fresh';
}

/** Per-step probes the runner supplies (real fs hashing / existence at call time). */
export interface StepProbe {
  /** sha256 of this step's inputs (source files + upstream outputs + glissade version). */
  currentHash: (step: BuildStep) => string;
  /** the input hash recorded when this step last ran (from the build manifest), or undefined. */
  recordedHash: (step: BuildStep) => string | undefined;
  /** does this step's committed output exist on disk? */
  outputExists: (step: BuildStep) => boolean;
}

/**
 * Plan one scene's steps. `steps` is the applicable subset in PIPELINE order (a
 * scene with no narration omits 'narrate', etc.). Returns a run/skip decision per
 * step; the first step that runs forces every later step to run (propagation).
 */
export function planScene(scene: string, steps: readonly BuildStep[], probe: StepProbe): StepPlan[] {
  const plans: StepPlan[] = [];
  let upstreamRan = false;
  for (const step of steps) {
    let action: 'run' | 'skip';
    let reason: StepPlan['reason'];
    if (upstreamRan) {
      action = 'run';
      reason = 'upstream re-ran';
    } else if (!probe.outputExists(step)) {
      action = 'run';
      reason = 'output missing';
    } else {
      const rec = probe.recordedHash(step);
      if (rec === undefined) {
        action = 'run';
        reason = 'never built';
      } else if (rec !== probe.currentHash(step)) {
        action = 'run';
        reason = 'inputs changed';
      } else {
        action = 'skip';
        reason = 'fresh';
      }
    }
    if (action === 'run') upstreamRan = true;
    plans.push({ scene, step, action, reason });
  }
  return plans;
}

/** Summary counts for a build plan (for the CLI report). */
export function planSummary(plans: readonly StepPlan[]): { run: number; skip: number; total: number } {
  const run = plans.filter((p) => p.action === 'run').length;
  return { run, skip: plans.length - run, total: plans.length };
}

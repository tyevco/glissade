/**
 * gs build (0.29): the content-graph staleness planner. Proves the DAG logic —
 * fresh steps skip, a changed input re-runs that step AND everything downstream
 * (propagation), missing outputs / never-built force a run — with pure probes.
 */

import { describe, expect, it } from 'vitest';
import { PIPELINE, planScene, planSummary, type BuildStep, type StepProbe } from '../src/buildPlan.js';

/** A probe over plain maps: recorded hashes, current hashes, and which outputs exist. */
function probe(opts: {
  current: Partial<Record<BuildStep, string>>;
  recorded?: Partial<Record<BuildStep, string>>;
  exists?: Partial<Record<BuildStep, boolean>>;
}): StepProbe {
  return {
    currentHash: (s) => opts.current[s] ?? `h:${s}`,
    recordedHash: (s) => opts.recorded?.[s],
    outputExists: (s) => opts.exists?.[s] ?? true,
  };
}

const allSteps = PIPELINE;
const actions = (scene: string, steps: readonly BuildStep[], p: StepProbe) =>
  Object.fromEntries(planScene(scene, steps, p).map((x) => [x.step, `${x.action}:${x.reason}`]));

describe('planScene — staleness', () => {
  it('all fresh → every step skips', () => {
    const rec = { narrate: 'a', sfx: 'b', 'measure-loudness': 'c', render: 'd' } as Record<BuildStep, string>;
    const p = probe({ current: rec, recorded: rec });
    expect(actions('e01', allSteps, p)).toEqual({
      narrate: 'skip:fresh', sfx: 'skip:fresh', 'measure-loudness': 'skip:fresh', render: 'skip:fresh',
    });
    expect(planSummary(planScene('e01', allSteps, p))).toEqual({ run: 0, skip: 4, total: 4 });
  });

  it('a changed narration re-runs narrate AND everything downstream (propagation)', () => {
    const rec = { narrate: 'OLD', sfx: 'b', 'measure-loudness': 'c', render: 'd' } as Record<BuildStep, string>;
    const cur = { ...rec, narrate: 'NEW' };
    const a = actions('e01', allSteps, probe({ current: cur, recorded: rec }));
    expect(a.narrate).toBe('run:inputs changed');
    expect(a.sfx).toBe('run:upstream re-ran');
    expect(a['measure-loudness']).toBe('run:upstream re-ran');
    expect(a.render).toBe('run:upstream re-ran');
  });

  it('a mid-pipeline change (sfx) re-runs sfx + downstream, but narrate stays fresh', () => {
    const rec = { narrate: 'a', sfx: 'OLD', 'measure-loudness': 'c', render: 'd' } as Record<BuildStep, string>;
    const cur = { ...rec, sfx: 'NEW' };
    const a = actions('e01', allSteps, probe({ current: cur, recorded: rec }));
    expect(a.narrate).toBe('skip:fresh');
    expect(a.sfx).toBe('run:inputs changed');
    expect(a['measure-loudness']).toBe('run:upstream re-ran');
    expect(a.render).toBe('run:upstream re-ran');
  });

  it('a missing output forces just that step (downstream propagates)', () => {
    const rec = { narrate: 'a', sfx: 'b', 'measure-loudness': 'c', render: 'd' } as Record<BuildStep, string>;
    const a = actions('e01', allSteps, probe({ current: rec, recorded: rec, exists: { render: false } }));
    expect(a.narrate).toBe('skip:fresh');
    expect(a['measure-loudness']).toBe('skip:fresh');
    expect(a.render).toBe('run:output missing');
  });

  it('never built (no recorded hash) → runs', () => {
    const a = actions('e01', allSteps, probe({ current: {}, recorded: {} }));
    expect(a.narrate).toBe('run:never built');
    expect(a.render).toBe('run:upstream re-ran'); // narrate ran → propagates
  });

  it('honors the applicable-subset (a scene with no narration/sfx)', () => {
    const rec = { 'measure-loudness': 'c', render: 'd' } as Record<BuildStep, string>;
    const steps: BuildStep[] = ['measure-loudness', 'render'];
    const a = actions('e-silent', steps, probe({ current: rec, recorded: rec }));
    expect(a).toEqual({ 'measure-loudness': 'skip:fresh', render: 'skip:fresh' });
  });
});

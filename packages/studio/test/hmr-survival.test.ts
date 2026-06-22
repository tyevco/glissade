/**
 * Assertion 4 — HMR survival (§6.2 rule 2). The load-bearing claim is the PURE
 * merge: a studio edit recorded against baseline T0 still binds after the code
 * baseline mutates to T1 (same target, different keys), and the change is
 * surfaced as drift — never silently clobbered. Node-env; no DOM needed.
 */

import { describe, expect, it } from 'vitest';
import { compileTimeline, key, sampleTrack, setDevWarning, timeline, track } from '@glissade/core';
// Sidecar API moved to the `@glissade/core/sidecar` subpath (0.20 budget review).
import { emptySidecar, mergeSidecar, mergeSidecarDetailed, setSidecarTrack } from '@glissade/core/sidecar';

const T0 = () => timeline({ tracks: [track('title/opacity', 'number', [key(0, 0), key(1, 1)])] });
// T1: the code baseline changed beneath the edit (same target, different keys)
const T1 = () => timeline({ tracks: [track('title/opacity', 'number', [key(0, 0), key(2, 1)])] });

describe('HMR survival — a GUI edit is preserved across a code-baseline change', () => {
  it('the edit (recorded vs T0) binds against both T0 and the mutated T1', () => {
    setDevWarning(() => {});
    const baseline = T0().tracks[0]!.keys;
    // an editor edit: pull the end key in to t=0.5 with a high value
    const edited = [key(0, 0), key(0.5, 0.8)];
    const sc = setSidecarTrack(emptySidecar(), 'main', 'title/opacity', 'number', edited, baseline);

    const onT0 = compileTimeline(mergeSidecar(T0(), sc)).tracks.get('title/opacity')!;
    expect(sampleTrack(onT0, 0.5)).toBeCloseTo(0.8, 6);

    // mutate the baseline to T1 — the merge STILL returns the edited keys
    const onT1 = compileTimeline(mergeSidecar(T1(), sc)).tracks.get('title/opacity')!;
    expect(sampleTrack(onT1, 0.5)).toBeCloseTo(0.8, 6);
    expect(onT1.keys.map((k) => k.t)).toEqual([0, 0.5]); // editor keys, not T1's [0, 2]
  });

  it('mergeSidecarDetailed flags the target as drift after the baseline changes (rule 2)', () => {
    setDevWarning(() => {});
    const baseline = T0().tracks[0]!.keys;
    const sc = setSidecarTrack(emptySidecar(), 'main', 'title/opacity', 'number', [key(0, 0), key(0.5, 0.8)], baseline);

    expect(mergeSidecarDetailed(T0(), sc).drift).toEqual([]); // baseline matches → no drift
    expect(mergeSidecarDetailed(T1(), sc).drift).toContain('title/opacity'); // changed → flagged
  });
});

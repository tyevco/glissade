/**
 * Determinism trace on DeterminismViolationError (card knEFdGXC99rw): when a
 * guarded evaluate() trips the §5.5 render-mode determinism guard, the thrown
 * error should NAME the first node whose cold re-eval disagrees — click-to-line,
 * not a hand-bisect across the episode.
 *
 * The locator (`locateViolation`, adapting the shipped `auditCacheCold`) is wired
 * as the third arg to `withDeterminismGuards('throw', fn, locate)`, exactly as the
 * CLI render path wires it. It runs ONLY on the violation branch, after the
 * guarded globals are restored, so its cold re-eval isn't re-trapped.
 */

import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { createScene, evaluate, Rect, type Scene } from '../src/index.js';
import { withDeterminismGuards, DeterminismViolationError } from '../src/guards.js';
import { locateViolation } from '../src/diagnostics.js';

const doc = timeline({ fps: 60, duration: 1, tracks: [] });

/** Evaluate `make()`'s scene under guards with the node-locator wired, at t=0. */
function guardedEvaluate(make: () => Scene): void {
  const scene = make();
  withDeterminismGuards(
    'throw',
    () => evaluate(scene, doc, 0),
    () => locateViolation(make, doc, 0),
  );
}

describe('determinism trace (card knEFdGXC99rw)', () => {
  it('names the SINGLE offending node among several — not a sibling', () => {
    const make = (): Scene =>
      createScene({
        size: { w: 40, h: 40 },
        children: [
          new Rect({ id: 'top', width: 10, height: 10, fill: '#0f0' }),
          new Rect({ id: 'bad', width: () => Math.random() * 10, height: 10, fill: '#f00' }),
          new Rect({ id: 'bottom', width: 10, height: 10, fill: '#00f' }),
        ],
      });
    let caught: DeterminismViolationError | undefined;
    try {
      guardedEvaluate(make);
    } catch (e) {
      caught = e as DeterminismViolationError;
    }
    expect(caught).toBeInstanceOf(DeterminismViolationError);
    expect(caught!.node).toBe('bad'); // the culprit, not 'top'/'bottom'
    expect(caught!.node).not.toBe('top');
    expect(caught!.node).not.toBe('bottom');
    // message string carries the id (click-to-line) AND the tripped API.
    expect(caught!.message).toContain("First divergent node 'bad'");
    expect(caught!.message).toContain('Math.random');
    // structured fields are populated: node + the command-level delta locator.
    expect(caught!.api).toBe('Math.random');
    expect(caught!.detail).toBeDefined();
    expect(caught!.detail!.fields.length).toBeGreaterThan(0);
  });

  it('MULTI-divergent: names the FIRST by emit order, stably across runs', () => {
    // TWO impure nodes: 'first' registers before 'second'. The locator walks the
    // node map in registration/emit order, so the FIRST culprit is named — and
    // the choice must be stable, never flapping to the sibling.
    const make = (): Scene =>
      createScene({
        size: { w: 40, h: 40 },
        children: [
          new Rect({ id: 'pure', width: 10, height: 10, fill: '#111' }),
          new Rect({ id: 'first', width: () => Math.random() * 10, height: 10, fill: '#f00' }),
          new Rect({ id: 'second', width: () => Math.random() * 10, height: 10, fill: '#0f0' }),
        ],
      });
    const names = new Set<string>();
    for (let run = 0; run < 5; run++) {
      let caught: DeterminismViolationError | undefined;
      try {
        guardedEvaluate(make);
      } catch (e) {
        caught = e as DeterminismViolationError;
      }
      expect(caught).toBeInstanceOf(DeterminismViolationError);
      names.add(caught!.node ?? '<none>');
    }
    // stable across every run — exactly one name, and it's the first culprit.
    expect(names).toEqual(new Set(['first']));
  });

  it('a fully deterministic scene does NOT throw (no false positive)', () => {
    const make = (): Scene =>
      createScene({
        size: { w: 40, h: 40 },
        children: [
          new Rect({ id: 'a', width: 10, height: 10, fill: '#fff' }),
          new Rect({ id: 'b', width: 20, height: 5, fill: '#000' }),
        ],
      });
    expect(() => guardedEvaluate(make)).not.toThrow();
  });

  it('the locator NEVER runs on the happy path (zero cost on a clean evaluate)', () => {
    // A locator that would throw if ever invoked proves the happy path never
    // touches it — enrichment is strictly the violation branch.
    const scene = createScene({
      size: { w: 20, h: 20 },
      children: [new Rect({ id: 'ok', width: 10, height: 10, fill: '#fff' })],
    });
    let locatorCalls = 0;
    const out = withDeterminismGuards(
      'throw',
      () => evaluate(scene, doc, 0),
      () => {
        locatorCalls++;
        throw new Error('locator must not run on the happy path');
      },
    );
    expect(out.commands.length).toBeGreaterThan(0);
    expect(locatorCalls).toBe(0);
  });

  it('without a locator the bare throw still stands (node/detail undefined)', () => {
    const scene = createScene({
      size: { w: 20, h: 20 },
      children: [new Rect({ id: 'bad', width: () => Math.random() * 10, height: 10, fill: '#f00' })],
    });
    let caught: DeterminismViolationError | undefined;
    try {
      // no third arg — legacy call shape, unchanged behavior.
      withDeterminismGuards('throw', () => evaluate(scene, doc, 0));
    } catch (e) {
      caught = e as DeterminismViolationError;
    }
    expect(caught).toBeInstanceOf(DeterminismViolationError);
    expect(caught!.node).toBeUndefined();
    expect(caught!.detail).toBeUndefined();
    expect(caught!.api).toBe('Math.random');
  });

  it('locateViolation returns undefined for a pure scene (no false locate)', () => {
    const make = (): Scene =>
      createScene({ size: { w: 20, h: 20 }, children: [new Rect({ id: 'ok', width: 10, height: 10, fill: '#fff' })] });
    expect(locateViolation(make, doc, 0)).toBeUndefined();
  });
});

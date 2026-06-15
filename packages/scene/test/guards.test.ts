/**
 * Render-mode determinism guards (§5.5): the runtime backstop to the static
 * eslint rules. Inside a guarded evaluate() the banned globals throw (CLI/CI)
 * or warn-once (dev), and are always restored afterward.
 */

import { describe, expect, it } from 'vitest';
import { setDevWarning, timeline } from '@glissade/core';
import { createScene, evaluate, Rect } from '../src/index.js';
import { withDeterminismGuards, DeterminismViolationError } from '../src/guards.js';

describe('withDeterminismGuards (§5.5)', () => {
  it('throw mode rejects a banned-global call and restores the global afterward', () => {
    const realRandom = Math.random;
    expect(() => withDeterminismGuards('throw', () => Math.random())).toThrow(DeterminismViolationError);
    expect(Math.random).toBe(realRandom); // restored even though fn threw
    expect(Date.now).toBeTypeOf('function');
  });

  it('off mode is a no-op; a clean fn runs under throw mode', () => {
    expect(withDeterminismGuards('off', () => 42)).toBe(42);
    expect(withDeterminismGuards('throw', () => 7)).toBe(7);
  });

  it('warn mode warns once per API then delegates to the real implementation', () => {
    const warnings: string[] = [];
    setDevWarning((m) => warnings.push(m));
    const r = withDeterminismGuards('warn', () => {
      Math.random();
      Math.random();
      return Date.now();
    });
    expect(r).toBeTypeOf('number'); // delegated to the real Date.now
    expect(warnings.filter((w) => w.includes('Math.random'))).toHaveLength(1);
    setDevWarning(() => {});
  });

  it('rejects an impure scene during a guarded evaluate (banned-clock-scene)', () => {
    const scene = createScene({
      size: { w: 20, h: 20 },
      children: [new Rect({ id: 'r', width: () => Math.random() * 10, height: 10, fill: '#fff' })],
    });
    const tl = timeline({ fps: 60, duration: 1, tracks: [] });
    expect(() => withDeterminismGuards('throw', () => evaluate(scene, tl, 0))).toThrow(DeterminismViolationError);
    // a pure scene evaluates fine under the same guard
    const pure = createScene({ size: { w: 20, h: 20 }, children: [new Rect({ id: 'r', width: 10, height: 10, fill: '#fff' })] });
    expect(() => withDeterminismGuards('throw', () => evaluate(pure, tl, 0))).not.toThrow();
  });
});

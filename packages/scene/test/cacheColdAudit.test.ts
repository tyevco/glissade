/**
 * Cache-cold determinism audit (§2.1/§5.5): a pure scene re-evaluates cold to a
 * byte-identical DisplayList; an impure node trips the audit and is named.
 */

import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { auditCacheCold, createScene, Rect } from '../src/index.js';

const doc = timeline({ fps: 60, duration: 1, tracks: [] });

describe('auditCacheCold', () => {
  it('a pure scene re-evaluates cache-cold to a byte-identical DisplayList', () => {
    const make = () =>
      createScene({ size: { w: 20, h: 20 }, children: [new Rect({ id: 'box', width: 10, height: 10, fill: '#fff' })] });
    expect(auditCacheCold(make, doc, 0)).toEqual({ ok: true });
  });

  it('an impure node (unseeded random) trips the audit and is named', () => {
    const make = () =>
      createScene({
        size: { w: 20, h: 20 },
        children: [
          new Rect({ id: 'ok', width: 10, height: 10, fill: '#0f0' }),
          new Rect({ id: 'bad', width: () => Math.random() * 10, height: 10, fill: '#f00' }),
        ],
      });
    const result = auditCacheCold(make, doc, 0);
    expect(result.ok).toBe(false);
    expect(result.node).toBe('bad'); // names the offending node, not the pure one
    // the WHOLE CommandDelta is embedded (additive) — the divergent op + fields,
    // not a flattened {op,index,a,b}. The width feeds the rect's geometry.
    expect(result.delta).toBeDefined();
    expect(result.delta!.fields.length).toBeGreaterThan(0);
    expect(Array.isArray(result.delta!.fields)).toBe(true);
  });

  it('a pure scene carries no delta (additive: the existing {ok,node?} shape is preserved)', () => {
    const make = () =>
      createScene({ size: { w: 20, h: 20 }, children: [new Rect({ id: 'box', width: 10, height: 10, fill: '#fff' })] });
    const result = auditCacheCold(make, doc, 0);
    expect(result).toEqual({ ok: true });
    expect(result.delta).toBeUndefined();
  });
});

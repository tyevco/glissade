/**
 * Node-safe checks for the browser-only package: the WGSL contract of the
 * built-in effects and the error surface. The GPU path itself is verified
 * in a real browser (it cannot run here by design — that is the point of
 * the package boundary).
 */

import { describe, expect, it } from 'vitest';
import { effects, WebGPUUnavailableError } from '../src/index.js';

describe('@glissade/effects-webgpu: the parts that must hold without a GPU', () => {
  it('built-in effects declare the entry point and a sorted-order Uniforms struct', () => {
    for (const [name, wgsl] of Object.entries(effects)) {
      expect(wgsl, name).toContain('fn effect(');
      expect(wgsl, name).toContain('@fragment');
      const m = /struct Uniforms \{([^}]*)\}/.exec(wgsl);
      expect(m, `${name} declares struct Uniforms`).not.toBeNull();
      // the runner packs uniform values in SORTED key order — every built-in
      // struct must declare its fields in that same order
      const fields = m![1]!
        .split(',')
        .map((f) => f.trim().split(':')[0]!.trim())
        .filter(Boolean);
      expect(fields, `${name} struct fields sorted`).toEqual([...fields].sort());
    }
  });

  it('the unavailable error names the degradation policy', () => {
    const e = new WebGPUUnavailableError('no adapter');
    expect(e.name).toBe('WebGPUUnavailableError');
    expect(e.message).toContain('caps.shaders');
  });
});

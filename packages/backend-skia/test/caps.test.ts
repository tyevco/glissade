/**
 * RenderBackend conformance (§3.4): SkiaBackend satisfies the declared
 * interface (compile-time) and exposes a coherent caps shape + the Promise
 * readPixels contract (runtime).
 */

import { describe, expect, it } from 'vitest';
import { ALL_FILTER_KINDS, type RenderBackend } from '@glissade/scene';
import { SkiaBackend } from '../src/index.js';

describe('RenderBackend caps', () => {
  it('SkiaBackend conforms to RenderBackend and exposes a coherent caps shape', () => {
    const backend: RenderBackend = new SkiaBackend(8, 8); // assignable ⇒ structurally conforms
    expect(backend.caps.shaders).toBe(false); // headless CPU Skia: no GPU shader pass
    expect(backend.caps.maxTextureSize).toBeGreaterThan(0);
    expect([...backend.caps.filters].sort()).toEqual([...ALL_FILTER_KINDS].sort());
    expect(backend.caps.filters.has('blur')).toBe(true);
    backend.dispose();
  });

  it('readPixels resolves to RGBA bytes (the Promise contract)', async () => {
    const backend = new SkiaBackend(4, 4);
    backend.render({ commands: [], resources: [], size: { w: 4, h: 4 } });
    const px = await backend.readPixels();
    expect(px.length).toBe(4 * 4 * 4);
    backend.dispose();
  });
});

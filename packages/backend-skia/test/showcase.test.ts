/**
 * Showcase smoke suite: every gallery scene compiles, renders non-empty
 * frames headlessly, and honors the purity contract. Not golden-tested —
 * showcase scenes are expected to evolve freely; this catches breakage.
 */

import { describe, expect, it } from 'vitest';
import { compileTimeline } from '@glissade/core';
import { evaluate, type SceneModule } from '@glissade/scene';
import { SkiaBackend } from '../src/index.js';
import spinners from '../../examples/src/scenes/showcase/spinners.js';
import loaders from '../../examples/src/scenes/showcase/loaders.js';
import dashboard from '../../examples/src/scenes/showcase/dashboard.js';
import transitions from '../../examples/src/scenes/showcase/transitions.js';
import micro from '../../examples/src/scenes/showcase/micro.js';
import flexboard from '../../examples/src/scenes/showcase/flexboard.js';
import interactive from '../../examples/src/scenes/showcase/interactive.js';
import { loadYogaLayoutEngine } from '../../scene/src/layout.js';

await loadYogaLayoutEngine();

const GALLERY: Record<string, SceneModule> = { spinners, loaders, dashboard, transitions, micro, flexboard, interactive };

describe('showcase gallery', () => {
  for (const [name, mod] of Object.entries(GALLERY)) {
    it(`'${name}' renders non-empty frames across its duration, purely`, async () => {
      const scene = mod.createScene();
      const compiled = compileTimeline(mod.timeline);
      expect(compiled.duration).toBeGreaterThanOrEqual(2);
      expect(compiled.duration).toBeLessThanOrEqual(10);

      const backend = new SkiaBackend(scene.size.w, scene.size.h);
      // mid-duration samples only: loop-closing scenes legitimately fade to
      // black near 0/1, and caption-only fade frames are font-dependent
      // across machines (system sans-serif varies)
      for (const f of [0.2, 0.45, 0.7]) {
        const t = f * compiled.duration;
        backend.render(evaluate(scene, mod.timeline, t));
        const px = await backend.readPixels();
        let nonBackground = 0;
        for (let i = 0; i < px.length; i += 4 * 97) {
          // sample sparsely: anything not near-black counts as content
          if (px[i]! + px[i + 1]! + px[i + 2]! > 90) nonBackground++;
        }
        expect(nonBackground, `${name} @ ${t.toFixed(2)}s looks empty`).toBeGreaterThan(10);
      }

      // purity: random-access ≡ repeat
      const a = evaluate(scene, mod.timeline, compiled.duration * 0.5);
      const b = evaluate(scene, mod.timeline, compiled.duration * 0.5);
      expect(a).toEqual(b);
    });
  }
});

describe('caps.shaders (§3.7): headless degradation, never GPU', () => {
  it('a ShaderEffect renders as passthrough with one warning on Skia', async () => {
    const { setDevWarning, timeline } = await import('@glissade/core');
    const { createScene, Circle, ShaderEffect } = await import('@glissade/scene');
    const warnings: string[] = [];
    setDevWarning((m) => warnings.push(m));
    const scene = createScene({
      size: { w: 60, h: 60 },
      children: [
        new ShaderEffect({
          id: 'fx',
          wgsl: '@fragment fn effect(@location(0) uv: vec2f) -> @location(0) vec4f { return vec4f(uv, 0.0, 1.0); }',
          children: [new Circle({ id: 'dot', radius: 20, fill: '#ff0000', position: [30, 30] })],
        }),
      ],
    });
    const backend = new SkiaBackend(60, 60);
    backend.render(evaluate(scene, timeline({ duration: 1 }), 0));
    backend.render(evaluate(scene, timeline({ duration: 1 }), 0.5));
    // passthrough: the circle still drew (no GPU here, no crash, no blank)
    const px = await backend.readPixels();
    const center = (30 * 60 + 30) * 4;
    expect(px[center]).toBeGreaterThan(200); // red circle visible
    // exactly one warning, naming the policy
    expect(warnings.filter((w) => w.includes('ShaderEffect pass skipped')).length).toBe(1);
    setDevWarning(() => {});
  });
});

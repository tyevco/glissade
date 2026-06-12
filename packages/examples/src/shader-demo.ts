/**
 * §3.7 demo: a ShaderEffect subtree warped by animated value-noise
 * displacement — the uniform rides an ordinary track. Requires WebGPU;
 * without it the scene still renders (caps.shaders passthrough + warning).
 */

import { key, timeline, track } from '@glissade/core';
import { createScene, Circle, Rect, ShaderEffect, Text, glow } from '@glissade/scene';
import { mount } from '@glissade/player';
import { effects, loadWebGPUEffects, WebGPUUnavailableError } from '@glissade/effects-webgpu';

declare global {
  interface Window {
    __shaderReady?: boolean;
    __webgpu?: boolean;
  }
}

const scene = createScene({
  size: { w: 640, h: 360 },
  children: [
    new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0b0c10' }),
    new ShaderEffect({
      id: 'fx',
      wgsl: effects.noiseDisplace,
      uniforms: { amount: 0, scale: 9, time: 0 },
      children: [
        new Circle({ id: 'orb', radius: 60, position: [220, 170], fill: '#4ea1ff', filters: glow('#4ea1ff', 14, 2) }),
        new Rect({ id: 'card', width: 150, height: 90, cornerRadius: 14, position: [430, 170], fill: '#e6a700' }),
        new Text({ id: 'label', text: 'perlin', fontSize: 32, fill: '#3ddc97', position: [275, 300] }),
      ],
    }),
  ],
});

const doc = timeline({
  duration: 4,
  fps: 60,
  tracks: [
    // shader params are just tracks: displacement breathes, the field drifts
    track('fx/u.amount', 'number', [key(0, 0), key(2, 60, 'easeInOutSine'), key(4, 0, 'easeInOutSine')]),
    track('fx/u.time', 'number', [key(0, 0), key(4, 3)]),
  ],
});

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
try {
  await loadWebGPUEffects();
  window.__webgpu = true;
} catch (e) {
  window.__webgpu = false;
  if (!(e instanceof WebGPUUnavailableError)) throw e;
}
mount(scene, doc, canvas, { loop: true, autoplay: true });
window.__shaderReady = true;

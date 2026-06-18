/**
 * Gradient-fill vs blur-filter soft-light render benchmark (0.10.1), gated
 * behind BENCH=1 so it never runs in the normal suite. Renders N soft-light
 * blobs two ways on the Skia backend and times the render:
 *   OLD: a solid-filled circle + a Gaussian `blur` filter (offscreen composite)
 *   NEW: a radial-gradient `fill` (no filter, no offscreen composite)
 * Both produce a soft glowing disc; the gradient is the cheap path.
 *   BENCH=1 npx vitest run packages/backend-skia/test/bench-gradient.test.ts
 */
import { describe, it } from 'vitest';
import { timeline } from '@glissade/core';
import { Circle, Rect, Group, createScene, evaluate } from '@glissade/scene';
import { SkiaBackend } from '../src/index.js';

const W = 1920;
const H = 1080;
const N = 16;
const FRAMES = 60;
const BLUR = 48;
const COLORS = ['#ff5d73', '#ffd86b', '#6bd0ff', '#9b8cff', '#4ea1ff', '#e6a700'];

const blobs = Array.from({ length: N }, (_, i) => {
  const col = i % 4;
  const row = Math.floor(i / 4);
  return { x: 240 + col * 480, y: 160 + row * 280, color: COLORS[i % COLORS.length]! };
});
const bg = () => new Rect({ id: 'bg', width: W, height: H, position: [W / 2, H / 2], fill: '#0a0a12' });

const sceneBlur = () =>
  createScene({
    size: { w: W, h: H },
    children: [bg(), ...blobs.map((b, i) => new Group({ id: 'bf' + i, position: [b.x, b.y], filters: [{ kind: 'blur', radius: BLUR }], children: [new Circle({ id: 'bc' + i, radius: 150, fill: b.color })] }))],
  });

const sceneGrad = () =>
  createScene({
    size: { w: W, h: H },
    children: [bg(), ...blobs.map((b, i) => new Rect({ id: 'gr' + i, width: 360, height: 360, position: [b.x, b.y], fill: { kind: 'radial' as const, stops: [{ offset: 0, color: b.color }, { offset: 1, color: '#0a0a12' }], radius: 180 } }))],
  });

function bench(label: string, makeScene: () => ReturnType<typeof createScene>): number {
  const scene = makeScene();
  const be = new SkiaBackend(W, H);
  const tl = timeline({ duration: 2 });
  for (let f = 0; f < 5; f++) be.render(evaluate(scene, tl, f / 30)); // warmup
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) be.render(evaluate(scene, tl, f / 30));
  const perFrame = (performance.now() - t0) / FRAMES;
  // eslint-disable-next-line no-console
  console.log(`${label.padEnd(28)} ${perFrame.toFixed(2).padStart(7)} ms/frame  |  ${(1000 / perFrame).toFixed(1).padStart(6)} fps`);
  return perFrame;
}

describe.runIf(process.env.BENCH === '1')('soft-light render: gradient fill vs blur filter', () => {
  it(`is faster with a radial-gradient fill (${N} blobs, ${W}x${H}, ${FRAMES} frames)`, () => {
    // eslint-disable-next-line no-console
    console.log(`\nSoft-light render benchmark — ${N} blobs, ${W}x${H}, ${FRAMES} frames, blur r=${BLUR}\n`);
    const blurMs = bench('OLD: solid + blur filter', sceneBlur);
    const gradMs = bench('NEW: radial gradient fill', sceneGrad);
    // eslint-disable-next-line no-console
    console.log(`\n→ gradient fill is ${(blurMs / gradMs).toFixed(2)}x faster per frame (${blurMs.toFixed(1)} → ${gradMs.toFixed(1)} ms/frame)\n`);
  });
});

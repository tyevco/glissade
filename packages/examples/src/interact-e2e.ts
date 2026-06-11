/**
 * Chromium e2e harness (v2 §C.5): mounts the interactive-button module with
 * real listeners, records from the first frame, and exposes hooks the
 * Playwright test drives. The canvas sits at (0,0) at 1:1 scale so client
 * coordinates ARE scene coordinates.
 */

import mod from './scenes/interactive-button';
import { mount } from '@glissade/player';
import { bakeTrace, createMachine, recordTrace, type InputTrace } from '@glissade/interact';

declare global {
  interface Window {
    __interactReady?: boolean;
    __state(): string;
    __stopTrace(): InputTrace;
    __bakeHere(trace: InputTrace): string;
  }
}

const scene = mod.createScene();
const canvas = document.createElement('canvas');
canvas.width = scene.size.w;
canvas.height = scene.size.h;
canvas.style.width = `${scene.size.w}px`;
canvas.style.height = `${scene.size.h}px`;
document.body.appendChild(canvas);

const mounted = mount(scene, mod.timeline, canvas, { loop: true, autoplay: true });
const spec = mod.machines[0]!;
const machine = createMachine(spec.doc, {
  resolve: (t) => scene.resolveTarget(t),
  ...(spec.timelines ? { timelines: spec.timelines } : {}),
});
mounted.player.attach(machine);
machine.clock.subscribe(() => mounted.render());
spec.wire?.({ scene, machine, element: canvas });

const rec = recordTrace(machine, { fps: 30 });

window.__state = () => machine.current();
window.__stopTrace = () => rec.stop();
window.__bakeHere = (trace) => {
  // a fresh scene + machine: replay is deterministic from the initial state.
  // default duration/fps so the Node-side bake uses identical parameters.
  const s2 = mod.createScene();
  const m2 = createMachine(spec.doc, {
    resolve: (t) => s2.resolveTarget(t),
    ...(spec.timelines ? { timelines: spec.timelines } : {}),
  });
  return JSON.stringify(bakeTrace(m2, trace));
};
window.__interactReady = true;

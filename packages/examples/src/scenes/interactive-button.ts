/**
 * The interactive-button scene (v2): a machine-driven button over a small
 * ambient timeline. One module serves every export route — `gs dev --record`,
 * `gs render --trace/--state`, and the Chromium e2e all load THIS file.
 */

import { key, timeline, track } from '@glissade/core';
import { Circle, createScene, Rect, type SceneModule } from '@glissade/scene';
import { createListeners, type MachineSpec, type StateMachineDoc } from '@glissade/interact';

const SIZE = { w: 320, h: 180 };

const tlIdle = timeline({
  tracks: [
    track('btn/radius', 'number', [key(0, 30)]),
    track('btn/fill', 'color', [key(0, '#3b82f6')]),
  ],
});
const tlHover = timeline({
  tracks: [
    track('btn/radius', 'number', [key(0, 34), key(0.6, 38, 'easeInOutQuad'), key(1.2, 34, 'easeInOutQuad')]),
    track('btn/fill', 'color', [key(0, '#22d3ee')]),
  ],
});
const tlTap = timeline({
  tracks: [
    track('btn/radius', 'number', [key(0, 24), key(0.3, 34, 'easeOutBack')]),
    track('btn/fill', 'color', [key(0, '#f59e0b')]),
  ],
});

const doc: StateMachineDoc = {
  version: 1,
  id: 'button',
  inputs: {
    hovered: { type: 'boolean', default: false },
    press: { type: 'trigger' },
  },
  initial: 'idle',
  states: {
    idle: { timeline: tlIdle },
    hover: { timeline: tlHover, loop: true },
    tap: { timeline: tlTap },
  },
  transitions: [
    { id: 't1', from: 'idle', to: 'hover', conditions: [{ input: 'hovered', is: true }], duration: 0.15 },
    { id: 't2', from: 'hover', to: 'idle', conditions: [{ input: 'hovered', is: false }], duration: 0.15 },
    { id: 't3', from: '*', to: 'tap', conditions: [{ trigger: 'press' }], duration: 0.1 },
    { id: 't4', from: 'tap', to: 'idle', conditions: [], exitTime: 1, duration: 0.1 },
  ],
};

const machines: MachineSpec[] = [
  {
    doc,
    wire: ({ scene, machine, element }) => {
      const L = createListeners({ scene, element });
      const btn = scene.nodes.get('btn')!;
      L.hover(btn, machine.input('hovered'));
      L.click(btn, () => machine.fire('press'));
      return () => L.dispose();
    },
  },
];

// ambient: a subtle background pulse, target-disjoint from the machine (§A.1)
const ambient = timeline({
  duration: 2,
  fps: 60,
  tracks: [track('bg/opacity', 'number', [key(0, 0.92), key(1, 1), key(2, 0.92)])],
});

const sceneModule: SceneModule & { machines: MachineSpec[] } = {
  createScene: () =>
    createScene({
      size: SIZE,
      children: [
        new Rect({ id: 'bg', position: [160, 90], width: 320, height: 180, fill: '#0f172a' }),
        new Circle({ id: 'btn', position: [160, 90], radius: 30, fill: '#3b82f6' }),
      ],
    }),
  timeline: ambient,
  machines,
};

export default sceneModule;

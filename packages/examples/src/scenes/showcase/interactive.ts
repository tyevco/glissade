/**
 * Showcase: "interactive" — the settings panel grows a pointer (v2). Two
 * toggles are REAL machine-driven toggles: click one mid-flight and the knob
 * reverses with its velocity intact (§B.3's headline case). The third toggle
 * and the drifting glow stay on the ambient timeline — machines and linear
 * playback coexist on one scene with statically disjoint targets (§A.1). The
 * save button is two one-liner presets (hover scale + press tint).
 */

import { key, timeline, track, type Vec2 } from '@glissade/core';
import { Circle, createScene, glow, Rect, Text, type SceneModule } from '@glissade/scene';
import { createListeners, hoverMachine, machineBuilder, pose, pressMachine, type MachineSpec } from '@glissade/interact';

const INK = '#cdd3de';
const MUTED = '#8b93a3';
const PILL_OFF = '#2a2f3a';
const PILL_ON = '#2f6b4f';
const KNOB_TRAVEL = 13;

const ROW_Y = [150, 205, 260];
const PILL_X = 560;

function toggleSpec(id: string, startOn: boolean): MachineSpec {
  const knob = `${id}-knob/position.x`;
  const pill = `${id}-pill/fill`;
  const t = { duration: 0.2, spring: { stiffness: 320, damping: 24, mass: 1 } };
  const doc = machineBuilder(id)
    .input('on', 'boolean', startOn)
    .state('off', pose({ [knob]: PILL_X - KNOB_TRAVEL, [pill]: PILL_OFF }))
    .state('on', pose({ [knob]: PILL_X + KNOB_TRAVEL, [pill]: PILL_ON }))
    .initial(startOn ? 'on' : 'off')
    .transition('off', 'on', { when: { input: 'on', is: true }, ...t })
    .transition('on', 'off', { when: { input: 'on', is: false }, ...t })
    .build();
  return {
    doc,
    wire: ({ scene, machine, element }) => {
      const L = createListeners({ scene, element });
      const pillNode = scene.nodes.get(`${id}-pill`)!;
      pillNode.hitArea = { kind: 'rect', x: -40, y: -22, w: 80, h: 44 }; // fat target (§C.3)
      // glow follows the machine: the fill is machine-animated, and filters
      // are signals, so the glow color/strength tracks the handoff live
      const pill = pillNode as InstanceType<typeof Rect>;
      pill.filters.bindSource(() =>
        machine.current() === 'on' ? glow(pill.fill(), 8, 2) : [],
      );
      L.click(pillNode, () => machine.input('on').set(!(machine.input('on')() as boolean)));
      return () => {
        pill.filters.unbindSource();
        L.dispose();
      };
    },
  };
}

const settingRow = (id: string, y: number, label: string, on: boolean) => [
  new Text({ id: `${id}-label`, text: label, fill: INK, fontSize: 15, position: [240, y + 5] }),
  new Rect({ id: `${id}-pill`, width: 56, height: 30, cornerRadius: 15, position: [PILL_X, y], fill: on ? PILL_ON : PILL_OFF }),
  new Circle({ id: `${id}-knob`, radius: 11, position: [PILL_X + (on ? KNOB_TRAVEL : -KNOB_TRAVEL), y], fill: '#ffffff' }),
];

// ambient: the third toggle flips on its own clock, and a glow drifts — all
// plain tracks, scrubbable, target-disjoint from the machines
const ambient = timeline({
  duration: 4,
  fps: 60,
  tracks: [
    track('t3-knob/position.x', 'number', [
      key(0, PILL_X - KNOB_TRAVEL),
      key(1, PILL_X - KNOB_TRAVEL),
      key(1.4, PILL_X + KNOB_TRAVEL, 'easeOutBack'),
      key(3, PILL_X + KNOB_TRAVEL),
      key(3.4, PILL_X - KNOB_TRAVEL, 'easeOutBack'),
    ]),
    track('t3-pill/fill', 'color', [
      key(0, PILL_OFF),
      key(1, PILL_OFF),
      key(1.4, PILL_ON),
      key(3, PILL_ON),
      key(3.4, PILL_OFF),
    ]),
    track('glow/position', 'vec2', [
      key<Vec2>(0, [180, 380]),
      key<Vec2>(2, [620, 380], 'easeInOutSine'),
      key<Vec2>(4, [180, 380], 'easeInOutSine'),
    ]),
  ],
});

const machines: MachineSpec[] = [
  toggleSpec('t1', true),
  toggleSpec('t2', false),
  hoverMachine('saveBtn', { from: { scale: [1, 1] }, to: { scale: [1.06, 1.06] }, duration: 0.15 }),
  pressMachine('saveBtn', { from: { fill: '#2f6b4f' }, to: { fill: '#1f4736' }, duration: 0.08 }),
];

const mod: SceneModule & { machines: MachineSpec[] } = {
  createScene: () =>
    createScene({
      size: { w: 800, h: 450 },
      children: [
        new Rect({ id: 'bg', width: 800, height: 450, position: [400, 225], fill: '#0f1014' }),
        new Circle({ id: 'glow', radius: 60, position: [180, 380], fill: '#16324a', opacity: 0.55 }),
        new Rect({ id: 'panelBg', width: 480, height: 320, cornerRadius: 18, position: [400, 215], fill: '#181b22' }),
        new Text({ id: 'title', text: 'Interactive', fill: INK, fontSize: 22, position: [240, 105] }),
        new Text({ id: 'hint', text: 'click the toggles · hover the button', fill: MUTED, fontSize: 12, position: [240, 127] }),
        ...settingRow('t1', ROW_Y[0]!, 'Velocity-matched handoffs', true),
        ...settingRow('t2', ROW_Y[1]!, 'Interrupt me mid-flight', false),
        ...settingRow('t3', ROW_Y[2]!, 'Ambient timeline (no machine)', false),
        new Rect({ id: 'saveBtn', width: 140, height: 40, cornerRadius: 10, position: [400, 322], fill: '#2f6b4f' }),
        new Text({ id: 'saveLabel', text: 'Save changes', fill: '#ffffff', fontSize: 14, position: [355, 327] }),
      ],
    }),
  timeline: ambient,
  machines,
};

export default mod;

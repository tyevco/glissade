/**
 * Canned presets (§C.7): the showcase cases competitors make one-liners
 * (whileHover={{ scale: 1.1 }}) — thin sugar over the builder + listeners.
 * Each returns a MachineSpec, so presets compose with `gs dev`, `gs render
 * --trace/--state`, and any embed that mounts module machines.
 */

import { type SpringConfig } from '@glissade/core';
import { type Node } from '@glissade/scene';
import { machineBuilder, pose } from './builder.js';
import { createListeners } from './listeners.js';
import { type MachineSpec } from './trace.js';

export interface PoseMachineOptions {
  /** Node-relative props for the resting pose, e.g. { scale: [1, 1] }. */
  from: Record<string, unknown>;
  /** The active pose. */
  to: Record<string, unknown>;
  /** Transition clock, seconds; default 0.15. */
  duration?: number;
  /** Offset-spring override for kinetic props (§B.3 default otherwise). */
  spring?: SpringConfig;
  /** Machine id; defaults to '<kind>-<nodeId>'. */
  id?: string;
}

function nodeId(node: Node | string): string {
  const id = typeof node === 'string' ? node : node.id;
  if (id === undefined) throw new Error('preset machines need a node with an explicit id (targets are id-addressed, §2.2)');
  return id;
}

const prefix = (id: string, props: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(props).map(([k, v]) => [`${id}/${k}`, v]));

function poseToggle(
  kind: 'hover' | 'press',
  node: Node | string,
  opts: PoseMachineOptions,
): { spec: MachineSpec; id: string } {
  const id = nodeId(node);
  const duration = opts.duration ?? 0.15;
  const t = { duration, ...(opts.spring ? { spring: opts.spring } : {}) };
  const input = kind === 'hover' ? 'hovered' : 'pressed';
  const doc = machineBuilder(opts.id ?? `${kind}-${id}`)
    .input(input, 'boolean')
    .state('idle', pose(prefix(id, opts.from)))
    .state(kind, pose(prefix(id, opts.to)))
    .initial('idle')
    .transition('idle', kind, { when: { input, is: true }, ...t })
    .transition(kind, 'idle', { when: { input, is: false }, ...t })
    .build();
  return { spec: { doc }, id };
}

/** Hover in/out between two poses; listeners wire themselves on mount. */
export function hoverMachine(node: Node | string, opts: PoseMachineOptions): MachineSpec {
  const { spec, id } = poseToggle('hover', node, opts);
  spec.wire = ({ scene, machine, element }) => {
    const L = createListeners({ scene, element });
    L.hover(scene.nodes.get(id) ?? (node as Node), machine.input('hovered'));
    return () => L.dispose();
  };
  return spec;
}

/** Press/release between two poses (primary pointer, down-over-target). */
export function pressMachine(node: Node | string, opts: PoseMachineOptions): MachineSpec {
  const { spec, id } = poseToggle('press', node, opts);
  spec.wire = ({ scene, machine, element }) => {
    const L = createListeners({ scene, element });
    L.press(scene.nodes.get(id) ?? (node as Node), machine.input('pressed'));
    return () => L.dispose();
  };
  return spec;
}

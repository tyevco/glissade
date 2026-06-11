/**
 * Machine export routes (v2 §A.6): a scene module that declares machines
 * renders only through --trace (record → replay → bake) or --state — anything
 * else is a build error, never a silent freeze-frame. The result is always a
 * plain linear Timeline the rest of the §5 pipeline consumes unchanged.
 */

import { readFileSync } from 'node:fs';
import { compileTimeline, timeline, type Timeline } from '@glissade/core';
import { type Scene, type SceneModule } from '@glissade/scene';
import { bakeTrace, createMachine, type InputTrace, type MachineSpec } from '@glissade/interact';

export interface MachineRenderFlags {
  trace?: string;
  state?: string;
  force?: boolean;
}

export class MachineExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MachineExportError';
  }
}

function specTargets(spec: MachineSpec): Set<string> {
  const targets = new Set<string>();
  for (const [id, s] of Object.entries(spec.doc.states)) {
    const tl = 'ref' in s.timeline ? spec.timelines?.[s.timeline.ref] : s.timeline;
    if (!tl) throw new MachineExportError(`machine '${spec.doc.id}': state '${id}' references a timeline not in spec.timelines`);
    for (const t of compileTimeline(tl).tracks.keys()) targets.add(t);
  }
  return targets;
}

/** §A.1: ambient timeline and every machine must own statically disjoint target sets. */
function checkDisjoint(ambientTargets: Set<string>, specs: MachineSpec[]): void {
  const owner = new Map<string, string>();
  for (const t of ambientTargets) owner.set(t, 'the scene timeline');
  for (const spec of specs) {
    for (const t of specTargets(spec)) {
      const prev = owner.get(t);
      if (prev) {
        throw new MachineExportError(
          `target '${t}' is animated by both ${prev} and machine '${spec.doc.id}' — ` +
            'concurrent writers are the silent last-writer-wins §2.2 exists to kill (§A.1)',
        );
      }
      owner.set(t, `machine '${spec.doc.id}'`);
    }
  }
}

/**
 * Decide what document to render. No machines: the module timeline, untouched.
 * With machines: --state merges one state's timeline over the ambient document;
 * --trace replays and bakes; neither is a hard error listing the routes.
 */
export function resolveRenderDoc(mod: SceneModule, scene: Scene, flags: MachineRenderFlags): Timeline {
  const specs = (mod as unknown as { machines?: MachineSpec[] }).machines ?? [];
  if (specs.length === 0) {
    if (flags.trace || flags.state) {
      throw new MachineExportError('this scene module declares no machines; --trace/--state do not apply');
    }
    return mod.timeline;
  }

  const ambient = compileTimeline(mod.timeline);
  checkDisjoint(new Set(ambient.tracks.keys()), specs);

  if (flags.state !== undefined) {
    if (specs.length !== 1) {
      throw new MachineExportError(`--state needs exactly one machine; this module declares ${specs.length}`);
    }
    const spec = specs[0]!;
    const st = spec.doc.states[flags.state];
    if (!st) {
      throw new MachineExportError(
        `--state '${flags.state}': machine '${spec.doc.id}' has no such state (have: ${Object.keys(spec.doc.states).join(', ')})`,
      );
    }
    const stTl = 'ref' in st.timeline ? spec.timelines?.[st.timeline.ref] : st.timeline;
    if (!stTl) throw new MachineExportError(`state '${flags.state}' references a timeline not in spec.timelines`);
    // one state, rendered linearly (§A.6 route 3), composed over the ambient
    // document (disjoint by the check above); the state's length wins
    return timeline({
      duration: compileTimeline(stTl).duration,
      ...(mod.timeline.fps !== undefined ? { fps: mod.timeline.fps } : {}),
      ...(mod.timeline.assets !== undefined ? { assets: mod.timeline.assets } : {}),
      children: [
        { timeline: mod.timeline, at: 0, mode: 'add' },
        { timeline: stTl, at: 0, mode: 'add' },
      ],
    });
  }

  if (flags.trace !== undefined) {
    const trace = JSON.parse(readFileSync(flags.trace, 'utf8')) as InputTrace;
    // pick the machine the trace was recorded against, by hash
    const machines = specs.map((spec) =>
      createMachine(spec.doc, {
        resolve: (t) => scene.resolveTarget(t),
        ...(spec.timelines ? { timelines: spec.timelines } : {}),
      }),
    );
    let machine = machines.find((m) => m.hash === trace.machineHash);
    if (!machine) {
      if (flags.force && machines.length === 1) machine = machines[0]!;
      else {
        for (const m of machines) m.dispose();
        throw new MachineExportError(
          `trace ${trace.machineHash} matches none of this module's machines — ` +
            're-record, or pass --force with a single-machine module (§C.5)',
        );
      }
    }
    const baked = bakeTrace(machine, trace, { ...(flags.force ? { force: true } : {}) });
    for (const m of machines) m.dispose(); // unbind; evaluate() rebinds through the merged doc
    return timeline({
      ...(mod.timeline.fps !== undefined ? { fps: mod.timeline.fps } : {}),
      ...(mod.timeline.assets !== undefined ? { assets: mod.timeline.assets } : {}),
      children: [
        { timeline: mod.timeline, at: 0, mode: 'add' },
        { timeline: baked, at: 0, mode: 'add' },
      ],
    });
  }

  throw new MachineExportError(
    `scene declares ${specs.length} state machine(s): every machine needs an export story (§A.6).\n` +
      `  --trace <take.trace.json>   record → replay → bake (capture with 'gs dev --record')\n` +
      `  --state <name>              render one state's timeline linearly`,
  );
}

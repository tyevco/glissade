/**
 * Scene assembly + the canonical evaluate(scene, timeline, t) (DESIGN.md §2.5,
 * §3.1): pure, total, deterministic — driver writes the playhead (sanctioned
 * entry write), then a pull-only read phase collects the DisplayList.
 */

import {
  bindTimeline,
  compileTimeline,
  createPlayhead,
  evaluateAt,
  type BoundTimeline,
  type CompiledTimeline,
  type Playhead,
  type Timeline,
} from '@glissade/core';
import { createDisplayListBuilder, type DisplayList } from './displayList.js';
import { estimatingMeasurer, type TextMeasurer } from './text.js';
import { type BindablePropTarget, type EvalContext, Node } from './node.js';
import { Group } from './nodes.js';

export interface Scene {
  readonly root: Group;
  readonly nodes: ReadonlyMap<string, Node>;
  readonly size: { w: number; h: number };
  /** Per-scene playhead; players and evaluate() write it. */
  readonly playhead: Playhead;
  resolveTarget(target: string): BindablePropTarget | undefined;
  /**
   * Inject the active backend's TextMeasurer (§3.2) so line breaking always
   * measures with the rasterizer that will draw. Defaults to an estimator.
   */
  setTextMeasurer(measurer: TextMeasurer): void;
  readonly textMeasurer: TextMeasurer;
}

export class DuplicateNodeIdError extends Error {
  constructor(id: string) {
    super(`duplicate node id '${id}' — explicit ids must be unique (§3.1/§6.5)`);
    this.name = 'DuplicateNodeIdError';
  }
}

function indexNodes(root: Node, into: Map<string, Node>, measurerSource: () => TextMeasurer): void {
  root.measurerSource = measurerSource;
  if (root.id !== undefined) {
    if (into.has(root.id)) throw new DuplicateNodeIdError(root.id);
    into.set(root.id, root);
  }
  if (root instanceof Group) {
    for (const child of root.children) indexNodes(child, into, measurerSource);
  }
}

export interface SceneInit {
  size: { w: number; h: number };
  children: Node[];
}

/**
 * The scene-module convention: what `gs render`, the golden harness, and the
 * studio load. createScene is a factory — every consumer gets a fresh graph.
 */
export interface SceneModule {
  createScene(): Scene;
  timeline: Timeline;
}

export function createScene(init: SceneInit): Scene {
  const root = new Group({ id: '__root', children: init.children });
  const nodes = new Map<string, Node>();
  const playhead = createPlayhead();
  let measurer: TextMeasurer = estimatingMeasurer;
  indexNodes(root, nodes, () => measurer);
  return {
    root,
    nodes,
    size: init.size,
    playhead,
    resolveTarget: (target) => {
      const slash = target.indexOf('/');
      if (slash < 0) return undefined;
      const node = nodes.get(target.slice(0, slash));
      return node?.resolveTarget(target.slice(slash + 1));
    },
    setTextMeasurer: (m) => {
      measurer = m;
    },
    get textMeasurer() {
      return measurer;
    },
  };
}

interface BindingCacheEntry {
  compiled: CompiledTimeline;
  bound: BoundTimeline;
}

// Sanctioned memoization (§2.1): re-binding the same (scene, document) pair is
// semantics-invisible; the dev harness re-runs cache-cold.
const bindings = new WeakMap<Scene, WeakMap<Timeline, BindingCacheEntry>>();

export function bindScene(scene: Scene, doc: Timeline): BindingCacheEntry {
  let perScene = bindings.get(scene);
  if (!perScene) {
    perScene = new WeakMap();
    bindings.set(scene, perScene);
  }
  let entry = perScene.get(doc);
  if (!entry) {
    const compiled = compileTimeline(doc);
    const bound = bindTimeline(compiled, scene.resolveTarget, scene.playhead);
    entry = { compiled, bound };
    perScene.set(doc, entry);
  }
  return entry;
}

/**
 * The non-negotiable contract (§2.5): same (scene, timeline, t) → identical
 * DisplayList, in any call order. Never awaits; asset readiness is the
 * caller's precondition.
 */
export function evaluate(scene: Scene, doc: Timeline, t: number): DisplayList {
  bindScene(scene, doc);
  const fps = doc.fps;
  const ctx: EvalContext = {
    time: t,
    frame: fps !== undefined ? Math.round(t * fps) : -1,
    measurer: scene.textMeasurer,
  };
  return evaluateAt(scene.playhead, t, () => {
    const out = createDisplayListBuilder(scene.size);
    scene.root.emit(out, ctx);
    return out.finish();
  });
}

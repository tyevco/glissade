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
  signal,
  type BoundTimeline,
  type CompiledTimeline,
  type Playhead,
  type Timeline,
  type Track,
} from '@glissade/core';
import { createDisplayListBuilder, type DisplayList, type FontSpec } from './displayList.js';
import {
  fallbackMeasurer,
  measureWrappedText as measureWrappedImpl,
  type TextMeasurer,
  type WrappedTextMetrics,
} from './text.js';
import { type BindablePropTarget, type EvalContext, Node } from './node.js';
import { Group } from './nodes.js';
import { isConstructionProp } from './constructionProps.js';

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
  /**
   * Measure how `text` wraps to `width` with `font`, using THIS scene's measurer
   * — `{ width, lines, height, ascent, descent }`. Size a container (bubble/card)
   * to wrapped text WITHOUT a Text node (the node-free analogue of
   * `Text.measuredSize`/`lineBoxes`). `lineHeight` is a multiple of `font.size`,
   * default 1.25.
   */
  measureWrappedText(text: string, font: FontSpec, width: number, lineHeight?: number): WrappedTextMetrics;
}

export class DuplicateNodeIdError extends Error {
  constructor(id: string) {
    super(`duplicate node id '${id}' — explicit ids must be unique (§3.1/§6.5)`);
    this.name = 'DuplicateNodeIdError';
  }
}

export class ReservedNodeIdError extends Error {
  constructor(id: string) {
    super(
      `node id '${id}' uses the reserved '~' prefix — that namespace is for structural ` +
        `fallback ids (§6.5), which are inspection-only and never track targets; choose another id`,
    );
    this.name = 'ReservedNodeIdError';
  }
}

function indexNodes(root: Node, into: Map<string, Node>, measurerSource: () => TextMeasurer): void {
  root.measurerSource = measurerSource;
  if (root.id !== undefined) {
    // reject the reserved structural namespace (§6.5). NOTE (pL9b, by design):
    // this fires at scene-assembly (indexNodes), not in the Node constructor —
    // intentional, matching DuplicateNodeIdError, since id validity is only
    // knowable once the node is placed in a scene graph.
    if (root.id.startsWith('~')) throw new ReservedNodeIdError(root.id);
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
  // un-injected scenes fall back through the process default (factory-time
  // measurement, §3.6) before the estimator. A SIGNAL so a measurer swap
  // (setTextMeasurer — e.g. after a webfont loads) invalidates any layout memo
  // that read it (the memo's computed pulls measurerSource() → tracks this).
  const measurer = signal<TextMeasurer | null>(null);
  indexNodes(root, nodes, () => measurer() ?? fallbackMeasurer());
  return {
    root,
    nodes,
    size: init.size,
    playhead,
    resolveTarget: (target) => {
      // Disambiguate node id / prop path by the LONGEST REGISTERED NODE-ID
      // PREFIX. BOTH a node id (`card/3`, minted by each()) and a prop path
      // (`money/fill`, a TokenHighlight range prop) may carry slashes, so a
      // fixed first/last split mis-resolves one or the other. Walk the slash
      // boundaries from the longest candidate node id down to the shortest; the
      // first prefix that is an actually-registered node owns the target, and
      // the remainder is the prop path it resolves. `card/3/opacity` → node
      // `card/3` + prop `opacity`; `hl/money/fill` → node `hl` + prop
      // `money/fill`. A bare string with no slash has no prop and never binds.
      for (let slash = target.lastIndexOf('/'); slash > 0; slash = target.lastIndexOf('/', slash - 1)) {
        const node = nodes.get(target.slice(0, slash));
        if (node) return node.resolveTarget(target.slice(slash + 1));
      }
      return undefined;
    },
    setTextMeasurer: (m) => {
      measurer.set(m);
    },
    get textMeasurer() {
      return measurer.peek() ?? fallbackMeasurer();
    },
    measureWrappedText: (text, font, width, lineHeight = 1.25) =>
      measureWrappedImpl(text, font, width, lineHeight, measurer.peek() ?? fallbackMeasurer()),
  };
}

interface BindingCacheEntry {
  compiled: CompiledTimeline;
  bound: BoundTimeline;
}

// Sanctioned memoization (§2.1): re-binding the same (scene, document) pair is
// semantics-invisible; the dev harness re-runs cache-cold.
const bindings = new WeakMap<Scene, WeakMap<Timeline, BindingCacheEntry>>();

/**
 * When a target fails to resolve, return a friendlier reason IF it names a
 * known CONSTRUCTION prop (animatable: false — e.g. `assetId`, `fontFamily`):
 * the target IS correctly rejected, but "no signal resolves to it" hides WHY.
 * Resolves the node by the same longest-registered-id-prefix walk as
 * `resolveTarget`, then checks the node's construction-prop schema. Returns
 * undefined (⇒ the generic message) for a genuinely-unknown prop or unknown id.
 */
function constructionPropMessage(nodes: ReadonlyMap<string, Node>, target: string): string | undefined {
  for (let slash = target.lastIndexOf('/'); slash > 0; slash = target.lastIndexOf('/', slash - 1)) {
    const node = nodes.get(target.slice(0, slash));
    if (!node) continue;
    const prop = target.slice(slash + 1);
    if (isConstructionProp(node.describeType, prop)) {
      return (
        `'${target}' is a construction prop (animatable:false) — set it at construction ` +
        `(new ${node.describeType}({ ${prop} })); it is not an animatable target.`
      );
    }
    // 0.25 (card OKvGXSizYf7w): a mesh Paint has NO per-point sub-path targets —
    // `fill` is a single signal, not a nested tree. Point at the real mechanism.
    if (/^fill\.points\./.test(prop)) {
      const id = target.slice(0, slash);
      return (
        `'${target}' does not resolve — a mesh Paint has no per-point sub-path targets. ` +
        `Animate the WHOLE fill as a paint track: track('${id}/fill', 'paint', [key(0, meshA), key(1, meshB)]) — ` +
        `two same-point-count meshes interpolate their points pairwise (pos + color).`
      );
    }
    return undefined; // node found, prop is not a construction prop ⇒ generic
  }
  return undefined;
}

export function bindScene(scene: Scene, doc: Timeline): BindingCacheEntry {
  let perScene = bindings.get(scene);
  if (!perScene) {
    perScene = new WeakMap();
    bindings.set(scene, perScene);
  }
  let entry = perScene.get(doc);
  if (!entry) {
    const compiled = compileTimeline(doc);
    const bound = bindTimeline(compiled, scene.resolveTarget, scene.playhead, {
      unboundMessage: (target) => constructionPropMessage(scene.nodes, target),
    });
    entry = { compiled, bound };
    perScene.set(doc, entry);
  }
  return entry;
}

/**
 * Empty timeline — zero tracks, so binding installs ZERO computed sources and
 * any imperative `node.set(...)` value survives evaluate untouched. Shared and
 * frozen so the WeakMap binding cache keys on a single stable document across
 * the whole controlled-drive loop (one bind, reused every frame).
 */
const EMPTY_TIMELINE: Timeline = Object.freeze({ version: 1, tracks: [] as Track[] });

/**
 * The non-negotiable contract (§2.5): same (scene, timeline, t) → identical
 * DisplayList, in any call order. Never awaits; asset readiness is the
 * caller's precondition.
 */
export function evaluate(scene: Scene, doc: Timeline, t: number): DisplayList;
/**
 * Controlled / imperative drive (0.19): `evaluate(scene)` with NO timeline —
 * the host owns the clock. It evaluates against an EMPTY timeline at the
 * scene's current playhead value (`peek()`, 0 by default), so values set
 * imperatively via `node.set(...)` between frames survive into the DisplayList
 * (no track clobbers them). See docs/controlled-drive.md for the loop and the
 * `.set()`-vs-timeline precedence contract.
 *
 * PRECEDENCE: a timeline track ALWAYS overrides `.set()` on the prop it
 * targets while that track is live — pass the timeline through the 3-arg form
 * for animated props; reserve this overload for host-owned props.
 */
export function evaluate(scene: Scene): DisplayList;
export function evaluate(scene: Scene, doc?: Timeline, t = 0): DisplayList {
  // Controlled-drive overload: no timeline ⇒ empty doc at the current playhead,
  // so imperative node.set(...) values survive (no track binds over them).
  if (doc === undefined) return evaluate(scene, EMPTY_TIMELINE, scene.playhead.peek());
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

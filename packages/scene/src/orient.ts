/**
 * Orientation drivers: rotate a node to face where it's *heading* (a path
 * tangent) or to *look at* another node. Both are the rotation-only siblings of
 * `followPath` — companion driver nodes that own only the target's `rotation`
 * via pull-based binding, so position stays whatever else drives it (keyframes,
 * layout, a separate followPath). Nothing executes at play time beyond a pure
 * read of signals already in the graph, so evaluate() stays a pure function of
 * time and the goldens are byte-stable.
 *
 * These live on the tree-shakeable `@glissade/scene/motion` subpath (like
 * followPath) — the base embed doesn't pay for them.
 */

import { signal, type BindableSignal, type PathValue, type Vec2 } from '@glissade/core';
import { Node, type NodeProps, type PropInit } from './node.js';
import { Path } from './nodes.js';
import { applyToPoint } from './matrix.js';
import { motionPath, type PathSampler } from './motionPath.js';

const DEG = 180 / Math.PI;

/**
 * A node's origin in WORLD space, computed WITHOUT reading its own
 * `worldMatrix`/`localMatrix` signals. That matters for the node being oriented:
 * its localMatrix depends on `rotation`, so a rotation source that read
 * `this.worldMatrix()` would form a rotation → worldMatrix → rotation cycle.
 * Projecting `position` through the PARENT's world transform breaks the cycle
 * (a parent's world never depends on its child's rotation). This aims from the
 * node's position origin; an explicit `anchor` offset is not applied (v1).
 */
function worldOrigin(n: Node): Vec2 {
  return n.parent ? applyToPoint(n.parent.worldMatrix(), n.position()) : n.position();
}

export interface OrientToPathProps extends NodeProps {
  /** the node whose `rotation` this owns (position is left to whatever drives it) */
  target: Node;
  /** a static PathValue, or a Path node followed LIVE (re-sampled as its `data` morphs) */
  path: PathValue | Path;
  /** 0→1 arc-length position whose TANGENT sets the angle; default 1. Track `<id>/progress`. */
  progress?: PropInit<number>;
  /** degrees added to the tangent angle (e.g. if the sprite points up at rest) */
  offset?: number;
  samplesPerSegment?: number;
}

/**
 * Owns `target.rotation`, binding it to the path tangent at `progress` — a node
 * banks to face the direction of travel while its POSITION is driven elsewhere
 * (keyframes, layout, or a sibling followPath sharing the same `progress`). The
 * rotation-only half of followPath's `orient`. Add it to the scene; it draws
 * nothing. Animate `<id>/progress`.
 */
export class OrientToPath extends Node {
  readonly target: Node;
  readonly progress: BindableSignal<number>;

  constructor(props: OrientToPathProps) {
    super(props);
    this.target = props.target;
    this.progress = signal(1);
    if (typeof props.progress === 'function') this.progress.bindSource(props.progress);
    else if (props.progress !== undefined) this.progress.set(props.progress);
    this.registerTarget('progress', this.progress, 'number');

    // same live/static caching as followPath: rebuild the arc-length table only
    // when the underlying PathValue reference changes. Pull-based + pure.
    const sOpts =
      props.samplesPerSegment !== undefined ? { samplesPerSegment: props.samplesPerSegment } : {};
    const getPath: () => PathValue =
      props.path instanceof Path ? () => (props.path as Path).data() : () => props.path as PathValue;
    let cachedPath = getPath();
    let cachedSampler = motionPath(cachedPath, sOpts);
    const sampler = (): PathSampler => {
      const pv = getPath();
      if (pv !== cachedPath) {
        cachedPath = pv;
        cachedSampler = motionPath(pv, sOpts);
      }
      return cachedSampler;
    };

    const offset = props.offset ?? 0;
    props.target.rotation.bindSource(() => {
      const t = sampler().tangentAtProgress(this.progress());
      return Math.atan2(t[1], t[0]) * DEG + offset;
    });
  }

  protected draw(): void {
    // a driver, not a drawable
  }
}

/** `children: [node, orientToPath(node, route, { progress: 0.5 })]` — node banks
 * to the route's direction at progress 0.5 while its position comes from elsewhere. */
export function orientToPath(
  target: Node,
  path: PathValue | Path,
  props: Omit<OrientToPathProps, 'target' | 'path'> = {},
): OrientToPath {
  return new OrientToPath({ ...props, target, path });
}

export interface LookAtProps extends NodeProps {
  /** the node whose `rotation` this owns */
  target: Node;
  /** the node to face — `target` rotates so its +x axis points at `at`'s origin */
  at: Node;
  /** degrees added to the facing angle (e.g. if the sprite points up at rest, pass -90) */
  offset?: number;
}

/**
 * Owns `target.rotation`, aiming target's local +x axis at `at`'s world origin —
 * a turret tracking a mover, an arrow pointing at a label. The angle is computed
 * in WORLD space and applied as `target`'s LOCAL rotation, which is exact when
 * target's parent is unrotated (the common case); a rotated parent would need
 * the parent's world rotation subtracted (v1 does not). Pure: rotation re-derives
 * from both nodes' positions each read, no stored state. Add it to the scene; it
 * draws nothing.
 */
export class LookAt extends Node {
  readonly target: Node;
  readonly at: Node;

  constructor(props: LookAtProps) {
    super(props);
    this.target = props.target;
    this.at = props.at;
    const offset = props.offset ?? 0;
    props.target.rotation.bindSource(() => {
      const self = worldOrigin(props.target);
      const to = worldOrigin(props.at);
      return Math.atan2(to[1] - self[1], to[0] - self[0]) * DEG + offset;
    });
  }

  protected draw(): void {
    // a driver, not a drawable
  }
}

/** `children: [turret, mover, lookAt(turret, mover)]` — turret always faces the mover. */
export function lookAt(
  target: Node,
  at: Node,
  props: Omit<LookAtProps, 'target' | 'at'> = {},
): LookAt {
  return new LookAt({ ...props, target, at });
}

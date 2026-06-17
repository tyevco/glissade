/**
 * Outline panel (DESIGN.md §6.1): the scene graph as a TREE — nodes nested by
 * parent/child — with selection only.
 *
 * SELECTION ONLY (§6.1, §6.2 rule 4): node existence and hierarchy are
 * code-owned; the studio offers NO structural mutation — no create, delete, or
 * reparent. Adding such a channel is explicitly out of v1 scope. This component
 * therefore takes a `scene` to read and an `onSelect`; it never writes.
 */

import { type Scene, Group, Node } from '@glissade/scene';

/** A node in the rendered tree: its display label, optional editable id, and children. */
export interface OutlineNode {
  /** The node's explicit id, when it has one (the only selectable handle). */
  id: string | undefined;
  /** Display label: the id, or the structural type for un-id'd nodes. */
  label: string;
  /** The node's constructor name (Group / Rect / Circle / …). */
  type: string;
  children: OutlineNode[];
}

/**
 * Build the outline tree from the scene root, skipping the `__root` sentinel
 * (its children become the top level). Reads the live scene graph: `Group`
 * exposes `children`; every other node is a leaf.
 */
export function buildOutline(scene: Scene): OutlineNode[] {
  const toNode = (n: Node): OutlineNode => {
    const type = n.constructor.name;
    const children = n instanceof Group ? n.children.map(toNode) : [];
    return { id: n.id, label: n.id ?? type, type, children };
  };
  return scene.root.children.map(toNode);
}

function Row({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: OutlineNode;
  depth: number;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const selectable = node.id !== undefined;
  return (
    <>
      <div
        className={`node outline-node${node.id === selected ? ' selected' : ''}${selectable ? '' : ' unselectable'}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        title={node.id ? `${node.type} #${node.id}` : `${node.type} (no id — not selectable)`}
        {...(selectable ? { onClick: () => onSelect(node.id!) } : {})}
      >
        <span className="outline-type">{node.type}</span>
        {node.id !== undefined && <span className="outline-id">{node.id}</span>}
      </div>
      {node.children.map((child, i) => (
        <Row key={child.id ?? `~${node.label}.${i}`} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </>
  );
}

/**
 * The scene-graph outline. Selection only — no structural-mutation props
 * (no onCreate/onDelete/onReparent): node structure is code-owned (§6.2 rule 4).
 */
export function OutlinePanel({
  scene,
  selected,
  onSelect,
}: {
  scene: Scene;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const tree = buildOutline(scene);
  return (
    <div className="outline">
      <h3>Nodes</h3>
      {tree.map((node, i) => (
        <Row key={node.id ?? `~root.${i}`} node={node} depth={0} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

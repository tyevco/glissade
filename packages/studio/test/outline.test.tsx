// @vitest-environment jsdom
/**
 * Assertion 5 (outline) + §6.2 rule 4: OutlinePanel renders the scene graph as a
 * TREE (child nested under parent), click selects, and exposes NO structural
 * mutation — node existence/hierarchy is code-owned. Selection only.
 */

import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createScene, Group, Rect, Circle } from '@glissade/scene';
import { OutlinePanel, buildOutline } from '../src/OutlinePanel.js';

afterEach(cleanup);

/** parent[group] → { child[rect], nested[group] → grandchild[circle] }, plus an un-id'd rect. */
const makeScene = () =>
  createScene({
    size: { w: 100, h: 100 },
    children: [
      new Group({
        id: 'parent',
        children: [
          new Rect({ id: 'child', width: 10, height: 10 }),
          new Group({ id: 'nested', children: [new Circle({ id: 'grandchild', radius: 5 })] }),
          new Rect({ width: 1, height: 1 }), // no id — present in the tree, not selectable
        ],
      }),
    ],
  });

describe('OutlinePanel — scene-graph tree', () => {
  it('builds a nested tree mirroring parent/child structure', () => {
    const tree = buildOutline(makeScene());
    expect(tree).toHaveLength(1);
    expect(tree[0]!.id).toBe('parent');
    const childIds = tree[0]!.children.map((n) => n.id);
    expect(childIds).toContain('child');
    expect(childIds).toContain('nested');
    const nested = tree[0]!.children.find((n) => n.id === 'nested')!;
    expect(nested.children.map((n) => n.id)).toEqual(['grandchild']); // grandchild nested under nested
  });

  it('renders rows with increasing indent depth (child deeper than parent)', () => {
    render(<OutlinePanel scene={makeScene()} selected={null} onSelect={() => {}} />);
    const parent = screen.getByTitle(/#parent/);
    const grandchild = screen.getByTitle(/#grandchild/);
    const pad = (el: Element) => parseInt((el as HTMLElement).style.paddingLeft || '0', 10);
    expect(pad(grandchild)).toBeGreaterThan(pad(parent));
  });

  it('clicking an id\'d node selects it', () => {
    const onSelect = vi.fn();
    render(<OutlinePanel scene={makeScene()} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTitle(/#child/));
    expect(onSelect).toHaveBeenCalledWith('child');
  });

  it('renders no structural-mutation control (selection only — §6.2 rule 4)', () => {
    // The component's prop contract is scene/selected/onSelect — there is no
    // onCreate/onDelete/onAddNode/onReparent channel (enforced by the type at
    // every call site; TS would reject one). Behaviorally, no mutation affordance
    // reaches the DOM: no add/delete buttons, no inline-rename fields.
    const { container } = render(<OutlinePanel scene={makeScene()} selected="child" onSelect={() => {}} />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('[contenteditable]')).toBeNull();
  });
});

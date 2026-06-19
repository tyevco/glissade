/**
 * The closed node taxonomy (DESIGN.md §3.1) is locked + enumerable: exactly
 * nine type names, no duplicates, matching the documented set, with each
 * non-Layout name resolving to an exported scene-node class (Layout lives in
 * the separately-budgeted './layout' entry, so only its NAME is in the base).
 * Also pins the public `Image` alias to `ImageNode`.
 */

import { describe, expect, it } from 'vitest';
import * as scene from '../src/index.js';
import { NODE_TAXONOMY, type NodeTypeName } from '../src/index.js';
import { Node } from '../src/index.js';

const DOCUMENTED = ['Group', 'Rect', 'Circle', 'Path', 'Text', 'Image', 'Video', 'Layout', 'Custom'] as const;

describe('NODE_TAXONOMY — the closed §3.1 node taxonomy', () => {
  it('has exactly nine entries', () => {
    expect(NODE_TAXONOMY).toHaveLength(9);
  });

  it('matches the documented set exactly (order included)', () => {
    expect([...NODE_TAXONOMY]).toEqual([...DOCUMENTED]);
  });

  it('has no duplicate names', () => {
    expect(new Set(NODE_TAXONOMY).size).toBe(NODE_TAXONOMY.length);
  });

  it('maps every non-Layout name to an exported scene node class extending Node', () => {
    for (const name of NODE_TAXONOMY) {
      if (name === 'Layout') continue; // ./layout entry, intentionally not in base index
      const exported = (scene as Record<string, unknown>)[name];
      expect(exported, `taxonomy name '${name}' must be an exported scene node class`).toBeTypeOf('function');
      expect(
        (exported as typeof Node).prototype instanceof Node || exported === Node,
        `'${name}' must extend Node`,
      ).toBe(true);
    }
  });

  it('exposes Image as an alias of ImageNode (DESIGN §3.1 public name)', () => {
    expect(scene.Image).toBe(scene.ImageNode);
  });

  it('NodeTypeName is the tuple member type', () => {
    // compile-time assertion: every documented name is assignable to NodeTypeName
    const names: NodeTypeName[] = [...DOCUMENTED];
    expect(names).toHaveLength(9);
  });
});

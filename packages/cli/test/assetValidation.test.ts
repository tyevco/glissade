/**
 * Render-seam asset pre-validation (0.14 DX): an Image/Video node referencing
 * an undeclared (or undefined — the `new Image({ src })` mistake) asset id must
 * surface a message naming the REAL cause (an `assetId` + a `timeline.assets`
 * entry, not a `src` URL) BEFORE evaluation, rather than the downstream
 * `asset 'undefined' not ready` ColdAssetError.
 */

import { describe, expect, it } from 'vitest';
import { Group, Rect, Image, Video } from '@glissade/scene';
import {
  collectAssetReferences,
  validateAssetReferences,
  UnknownAssetError,
} from '../src/assetValidation.js';

type WalkRoot = Parameters<typeof collectAssetReferences>[0];

describe('collectAssetReferences', () => {
  it('collects Image/Video refs (with node ids), skips non-asset nodes', () => {
    const root = new Group({
      children: [
        new Rect({ id: 'bg', width: 10, height: 10 }),
        new Image({ id: 'logo', assetId: 'logo-png', width: 10, height: 10 }),
        new Group({ children: [new Video({ id: 'clip', assetId: 'intro-mp4' })] }),
      ],
    });
    expect(collectAssetReferences(root as unknown as WalkRoot)).toEqual([
      { assetId: 'logo-png', kind: 'image', nodeId: 'logo' },
      { assetId: 'intro-mp4', kind: 'video', nodeId: 'clip' },
    ]);
  });

  it('surfaces an undefined assetId as-is (the `new Image({ src })` mistake)', () => {
    const img = new Image({ width: 10, height: 10 } as unknown as { assetId: string; width: number; height: number });
    const refs = collectAssetReferences(new Group({ children: [img] }) as unknown as WalkRoot);
    expect(refs[0]!.assetId).toBeUndefined();
  });
});

describe('validateAssetReferences', () => {
  const refsFor = (assetId: string | undefined): ReturnType<typeof collectAssetReferences> =>
    collectAssetReferences(
      new Group({
        children: [new Image({ id: 'logo', assetId, width: 1, height: 1 } as never)],
      }) as unknown as WalkRoot,
    );

  it('is a no-op when every reference is declared', () => {
    expect(() => validateAssetReferences(refsFor('a'), ['a', 'b'])).not.toThrow();
  });

  it('throws UnknownAssetError naming the declared set for an undeclared id', () => {
    expect(() => validateAssetReferences(refsFor('missing'), ['a', 'b'])).toThrow(UnknownAssetError);
    try {
      validateAssetReferences(refsFor('missing'), ['a', 'b']);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("assetId 'missing'");
      expect(msg).toContain('not declared in timeline.assets');
      expect(msg).toContain('declared: a, b');
      expect(msg).toContain('not a `src` URL');
    }
  });

  it('throws for an undefined assetId and names it', () => {
    expect(() => validateAssetReferences(refsFor(undefined), ['a'])).toThrow(/assetId <undefined>/);
  });

  it('reports `(none)` when no assets are declared', () => {
    expect(() => validateAssetReferences(refsFor('x'), [])).toThrow(/declared: \(none\)/);
  });
});

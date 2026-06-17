/**
 * Backward-compat regression (§3.6): the AssetRef extension is purely additive.
 * A bare `{ kind: 'font', url }` must round-trip through `timeline()` unchanged
 * (no `faces`/`fallback` keys introduced) so every existing golden/example
 * document is byte-identical.
 */

import { describe, expect, it } from 'vitest';
import { timeline, type AssetRef } from '../src/index.js';

describe('AssetRef font extension is additive', () => {
  it('a bare font asset is stored verbatim — no faces/fallback added', () => {
    const ref: AssetRef = { kind: 'font', url: 'fonts/DejaVuSans.ttf' };
    const doc = timeline({ assets: { 'DejaVu Sans': ref } });
    expect(doc.assets).toEqual({ 'DejaVu Sans': { kind: 'font', url: 'fonts/DejaVuSans.ttf' } });
    expect(Object.keys(doc.assets!['DejaVu Sans']!)).toEqual(['kind', 'url']);
  });

  it('faces/fallback survive when explicitly provided', () => {
    const ref: AssetRef = {
      kind: 'font',
      url: 'x.ttf',
      faces: [{ url: 'b.ttf', weight: 700 }],
      fallback: ['serif'],
    };
    const doc = timeline({ assets: { Brand: ref } });
    expect(doc.assets!.Brand).toEqual(ref);
  });
});

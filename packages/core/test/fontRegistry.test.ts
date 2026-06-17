/**
 * FontRegistry (§3.6): the bare single-face form vs explicit faces + fallback,
 * CSS nearest-weight resolution, and the fallback chain. The bare
 * `{ kind:'font', url }` MUST map to a single 400/normal face with a `[family]`
 * chain — that's the backward-compat contract every existing document relies on.
 */

import { describe, expect, it } from 'vitest';
import { buildFontRegistry, type AssetRef } from '../src/index.js';

describe('buildFontRegistry', () => {
  it('bare font asset → one 400/normal face and a [family] chain', () => {
    const reg = buildFontRegistry({ Inter: { kind: 'font', url: 'inter.ttf' } });
    expect(reg.has('Inter')).toBe(true);
    expect(reg.has('Nope')).toBe(false);
    expect(reg.faces()).toEqual([{ family: 'Inter', url: 'inter.ttf', weight: 400, style: 'normal' }]);
    expect(reg.fallbackChain('Inter')).toEqual(['Inter']);
    expect(reg.resolveFace('Inter')).toEqual({ family: 'Inter', url: 'inter.ttf', weight: 400, style: 'normal' });
  });

  it('registers EVERY declared face, not one per asset', () => {
    const ref: AssetRef = {
      kind: 'font',
      url: 'inter.ttf',
      faces: [
        { url: 'inter-400.ttf' },
        { url: 'inter-700.ttf', weight: 700 },
        { url: 'inter-italic.ttf', style: 'italic' },
      ],
      fallback: ['Noto Sans', 'sans-serif'],
    };
    const reg = buildFontRegistry({ Inter: ref });
    expect(reg.faces()).toHaveLength(3);
    expect(reg.fallbackChain('Inter')).toEqual(['Inter', 'Noto Sans', 'sans-serif']);
  });

  it('resolveFace picks the CSS nearest weight (lighter on a tie)', () => {
    const reg = buildFontRegistry({
      Inter: {
        kind: 'font',
        url: 'x',
        faces: [
          { url: '300.ttf', weight: 300 },
          { url: '500.ttf', weight: 500 },
          { url: '700.ttf', weight: 700 },
        ],
      },
    });
    expect(reg.resolveFace('Inter', 600)?.weight).toBe(500); // 600: |500-600|=|700-600|=100, tie → lighter
    expect(reg.resolveFace('Inter', 800)?.weight).toBe(700);
    expect(reg.resolveFace('Inter', 100)?.weight).toBe(300);
    expect(reg.resolveFace('Inter', 400)?.weight).toBe(300); // 400: closest is 300 (dist 100 vs 500 dist 100) → lighter
  });

  it('resolveFace honours style, falling back to any face when style is absent', () => {
    const reg = buildFontRegistry({
      Inter: {
        kind: 'font',
        url: 'x',
        faces: [
          { url: 'reg.ttf', weight: 400, style: 'normal' },
          { url: 'ital.ttf', weight: 400, style: 'italic' },
        ],
      },
    });
    expect(reg.resolveFace('Inter', 400, 'italic')?.url).toBe('ital.ttf');
    expect(reg.resolveFace('Inter', 400, 'normal')?.url).toBe('reg.ttf');
  });

  it('unknown family → resolveFace undefined, chain is just [family]', () => {
    const reg = buildFontRegistry({});
    expect(reg.resolveFace('Ghost')).toBeUndefined();
    expect(reg.fallbackChain('Ghost')).toEqual(['Ghost']);
  });

  it('ignores non-font assets', () => {
    const reg = buildFontRegistry({
      pic: { kind: 'image', url: 'a.png' },
      Inter: { kind: 'font', url: 'i.ttf' },
    });
    expect(reg.has('pic')).toBe(false);
    expect(reg.faces()).toHaveLength(1);
  });

  it('undefined assets → empty registry', () => {
    const reg = buildFontRegistry(undefined);
    expect(reg.faces()).toEqual([]);
  });
});

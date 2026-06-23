// @vitest-environment jsdom
/**
 * Structural (NOT pixel) test suite for the DOM backend — the contract is
 * "the right elements per op + transforms compose + geometry round-trips"
 * (docs/design/dom-backend.md "Seam 3 — PREVIEW / NON-PARITY"). We author fixed
 * DisplayLists directly (no scene needed) and assert on the produced DOM. There
 * is deliberately NO golden PNG and NO SSIM — those would assert a parity this
 * backend does not claim.
 */
import { describe, expect, it } from 'vitest';
import { setDevWarning } from '@glissade/core';
import type { DisplayList, DrawCommand, Resource } from '@glissade/scene';
import { DomBackend } from '../src/index.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function list(commands: DrawCommand[], resources: Resource[] = [], size = { w: 100, h: 80 }): DisplayList {
  return { commands, resources, size };
}

function renderTo(dl: DisplayList, ids?: readonly (string | undefined)[]): HTMLElement {
  const b = new DomBackend(document);
  if (ids) b.setIds(ids);
  b.render(dl);
  return b.root;
}

describe('DomBackend — structure & nesting', () => {
  it('sizes the root and marks it', () => {
    const root = renderTo(list([]));
    expect(root.getAttribute('data-gs-dom')).toBe('');
    expect(root.style.width).toBe('100px');
    expect(root.style.height).toBe('80px');
  });

  it('transform opens a nested div carrying the exact CSS matrix; draws compose under it', () => {
    const root = renderTo(
      list(
        [
          { op: 'transform', m: [1, 0, 0, 1, 5, 7] },
          { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#f00' } },
        ],
        [{ kind: 'path', segs: [['M', 0, 0], ['L', 10, 0], ['L', 5, 10], ['Z']] }],
      ),
    );
    const wrap = root.querySelector('div[style*="matrix"]') as HTMLElement;
    expect(wrap).toBeTruthy();
    expect(wrap.style.transform).toBe('matrix(1, 0, 0, 1, 5, 7)');
    // the path's <svg> is a DESCENDANT of the transform wrapper (transforms compose)
    expect(wrap.querySelector('svg path')).toBeTruthy();
  });

  it('save/restore unwinds the cursor so a post-restore draw is NOT under the transform', () => {
    const root = renderTo(
      list(
        [
          { op: 'save' },
          { op: 'transform', m: [2, 0, 0, 2, 0, 0] },
          { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#0f0' } },
          { op: 'restore' },
          { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#00f' } },
        ],
        [{ kind: 'path', segs: [['M', 0, 0], ['L', 1, 0], ['Z']] }],
      ),
    );
    const wrap = root.querySelector('div[style*="matrix"]') as HTMLElement;
    // first path under the transform; second path is a direct child of root.
    expect(wrap.querySelectorAll('svg').length).toBe(1);
    const rootSvgs = Array.from(root.children).filter((c) => c.tagName.toLowerCase() === 'svg');
    expect(rootSvgs.length).toBe(1); // the post-restore fill
  });
});

describe('DomBackend — geometry round-trips', () => {
  it('fillPath reconstructs M/L/C/Q/Z in the d attribute', () => {
    const root = renderTo(
      list(
        [{ op: 'fillPath', path: 0, paint: { kind: 'color', color: '#abc' } }],
        [{ kind: 'path', segs: [['M', 0, 0], ['L', 10, 0], ['C', 1, 2, 3, 4, 5, 6], ['Q', 7, 8, 9, 10], ['Z']] }],
      ),
    );
    const path = root.querySelector('svg path')!;
    expect(path.getAttribute('d')).toBe('M0 0 L10 0 C1 2 3 4 5 6 Q7 8 9 10 Z');
    expect(path.getAttribute('fill')).toBe('#abc');
  });

  it('the ellipse E seg becomes an SVG arc (A) — a full circle splits into two arcs', () => {
    const root = renderTo(
      list(
        [{ op: 'fillPath', path: 0, paint: { kind: 'color', color: '#000' } }],
        [{ kind: 'path', segs: [['E', 0, 0, 5, 5, 0, 0, Math.PI * 2], ['Z']] }],
      ),
    );
    const d = root.querySelector('svg path')!.getAttribute('d')!;
    expect(d.startsWith('M')).toBe(true);
    expect((d.match(/A/g) ?? []).length).toBe(2); // 360° → two half-arcs
  });

  it('strokePath emits fill=none + StrokeStyle attributes', () => {
    const root = renderTo(
      list(
        [
          {
            op: 'strokePath',
            path: 0,
            paint: { kind: 'color', color: '#111' },
            stroke: { width: 3, cap: 'round', join: 'bevel', dash: [4, 2], dashOffset: 1 },
          },
        ],
        [{ kind: 'path', segs: [['M', 0, 0], ['L', 10, 10]] }],
      ),
    );
    const path = root.querySelector('svg path')!;
    expect(path.getAttribute('fill')).toBe('none');
    expect(path.getAttribute('stroke')).toBe('#111');
    expect(path.getAttribute('stroke-width')).toBe('3');
    expect(path.getAttribute('stroke-linecap')).toBe('round');
    expect(path.getAttribute('stroke-linejoin')).toBe('bevel');
    expect(path.getAttribute('stroke-dasharray')).toBe('4 2');
    expect(path.getAttribute('stroke-dashoffset')).toBe('1');
  });
});

describe('DomBackend — paint', () => {
  it('linear gradient → <linearGradient> def + fill=url(#…)', () => {
    const root = renderTo(
      list(
        [
          {
            op: 'fillPath',
            path: 0,
            paint: { kind: 'linear', from: [0, 0], to: [10, 0], stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] },
          },
        ],
        [{ kind: 'path', segs: [['M', 0, 0], ['L', 10, 0], ['Z']] }],
      ),
    );
    const grad = root.querySelector('linearGradient')!;
    expect(grad).toBeTruthy();
    expect(grad.querySelectorAll('stop').length).toBe(2);
    expect(grad.getAttribute('x2')).toBe('10');
    const fill = root.querySelector('svg path')!.getAttribute('fill')!;
    expect(fill).toBe(`url(#${grad.getAttribute('id')})`);
  });

  it('radial gradient → <radialGradient> def', () => {
    const root = renderTo(
      list(
        [{ op: 'fillPath', path: 0, paint: { kind: 'radial', center: [5, 5], radius: 5, stops: [{ offset: 0, color: '#f00' }] } }],
        [{ kind: 'path', segs: [['M', 0, 0], ['L', 1, 0], ['Z']] }],
      ),
    );
    expect(root.querySelector('radialGradient')).toBeTruthy();
  });

  it('mesh paint degrades to a solid fill + warns once', () => {
    const warnings: string[] = [];
    setDevWarning((m) => void warnings.push(m));
    try {
      const root = renderTo(
        list(
          [{ op: 'fillPath', path: 0, paint: { kind: 'mesh', bg: '#123456', points: [{ pos: [0, 0], color: '#fff' }] } }],
          [{ kind: 'path', segs: [['M', 0, 0], ['L', 1, 0], ['Z']] }],
        ),
      );
      const path = root.querySelector('svg path')!;
      expect(path.getAttribute('fill')).toBe('#123456');
      // degraded paint flags itself so an editor can badge "preview-approx"
      expect(path.getAttribute('data-approx')).toBe('true');
      expect(warnings.some((w) => /mesh-gradient/.test(w))).toBe(true);
    } finally {
      setDevWarning((m) => void globalThis.console?.warn(m));
    }
  });
});

describe('DomBackend — text, clip, image, groups', () => {
  it('fillText → a positioned div with font/color/content', () => {
    const root = renderTo(
      list([{ op: 'fillText', text: 'hi', font: { family: 'Inter', size: 24, weight: 700 }, paint: { kind: 'color', color: '#246' }, x: 12, y: 30, align: 'center' }]),
    );
    const div = Array.from(root.querySelectorAll('div')).find((d) => d.textContent === 'hi') as HTMLElement;
    expect(div).toBeTruthy();
    expect(div.style.left).toBe('12px');
    expect(div.style.top).toBe('30px');
    expect(div.style.color).toBe('rgb(34, 68, 102)'); // #246 normalized by jsdom
    expect(div.style.textAlign).toBe('center');
  });

  it('clip → a <clipPath> def with clip-rule + a referencing wrapper', () => {
    const root = renderTo(
      list(
        [
          { op: 'clip', path: 0, rule: 'evenodd' },
          { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#000' } },
        ],
        [{ kind: 'path', segs: [['M', 0, 0], ['L', 10, 0], ['L', 5, 10], ['Z']] }],
      ),
    );
    const cp = root.querySelector('clipPath')!;
    expect(cp).toBeTruthy();
    expect(cp.querySelector('path')!.getAttribute('clip-rule')).toBe('evenodd');
    const wrap = root.querySelector('div[style*="clip-path"]') as HTMLElement;
    expect(wrap.style.clipPath).toBe(`url(#${cp.getAttribute('id')})`);
    expect(wrap.querySelector('svg path')).toBeTruthy(); // the clipped fill nests under it
  });

  it('drawImage → an <img> at the dst box, resolving a registered asset src', () => {
    const b = new DomBackend(document);
    b.setImageAsset('hero', 'https://example.test/hero.png');
    b.render(
      list(
        [{ op: 'drawImage', image: 0, dst: { x: 4, y: 6, w: 40, h: 20 } }],
        [{ kind: 'image', assetId: 'hero' }],
      ),
    );
    const img = b.root.querySelector('img') as HTMLImageElement;
    expect(img.style.left).toBe('4px');
    expect(img.style.width).toBe('40px');
    expect(img.getAttribute('data-asset-id')).toBe('hero');
    expect(img.src).toBe('https://example.test/hero.png');
  });

  it('pushGroup → a wrapper div with opacity/mix-blend-mode/filter; popGroup closes it; cacheKey ignored', () => {
    const root = renderTo(
      list(
        [
          { op: 'pushGroup', opacity: 0.5, blend: 'multiply', filters: [{ kind: 'blur', radius: 4 }], cacheKey: 'k' },
          { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#000' } },
          { op: 'popGroup' },
          { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#fff' } },
        ],
        [{ kind: 'path', segs: [['M', 0, 0], ['L', 1, 0], ['Z']] }],
      ),
    );
    const grp = root.querySelector('div[style*="blend"]') as HTMLElement;
    expect(grp.style.opacity).toBe('0.5');
    expect(grp.style.mixBlendMode).toBe('multiply');
    expect(grp.style.filter).toContain('blur(4px)');
    expect(grp.querySelectorAll('svg').length).toBe(1); // only the in-group fill
    // the post-popGroup fill is a sibling of the group, not inside it
    const rootSvgs = Array.from(root.children).filter((c) => c.tagName.toLowerCase() === 'svg');
    expect(rootSvgs.length).toBe(1);
  });
});

describe('DomBackend — identity, caps, readPixels', () => {
  it('stamps data-node-id from the id stream; without ids the tree is identical but unstamped', () => {
    const dl = list(
      [
        { op: 'transform', m: [1, 0, 0, 1, 0, 0] },
        { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#000' } },
      ],
      [{ kind: 'path', segs: [['M', 0, 0], ['L', 1, 0], ['Z']] }],
    );
    const withIds = renderTo(dl, ['grp', 'shape']);
    expect(withIds.querySelector('[data-node-id="grp"]')).toBeTruthy();
    expect(withIds.querySelector('[data-node-id="shape"]')).toBeTruthy();

    const without = renderTo(dl);
    expect(without.querySelector('[data-node-id]')).toBeNull();
    // structurally identical: same element count
    expect(without.querySelectorAll('*').length).toBe(withIds.querySelectorAll('*').length);
  });

  it('advertises CSS-native caps (all filters, no shaders)', () => {
    const b = new DomBackend(document);
    expect(b.caps.shaders).toBe(false);
    expect([...b.caps.filters].sort()).toEqual(['blur', 'brightness', 'contrast', 'drop-shadow', 'saturate']);
  });

  it('readPixels rejects (preview/non-parity — no pixel buffer)', async () => {
    const b = new DomBackend(document);
    await expect(b.readPixels()).rejects.toThrow(/no pixel buffer/);
  });

  it('re-rendering rebuilds (forward render — no stale nodes)', () => {
    const b = new DomBackend(document);
    b.render(list([{ op: 'fillText', text: 'a', font: { family: 'X', size: 10 }, paint: { kind: 'color', color: '#000' }, x: 0, y: 0 }]));
    b.render(list([{ op: 'fillText', text: 'b', font: { family: 'X', size: 10 }, paint: { kind: 'color', color: '#000' }, x: 0, y: 0 }]));
    const texts = Array.from(b.root.querySelectorAll('div')).map((d) => d.textContent);
    expect(texts).toEqual(['b']); // the 'a' render was cleared
  });
});

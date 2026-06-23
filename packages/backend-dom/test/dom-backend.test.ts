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
  it('fillText → a positioned div with font/color/content; align maps to a translate (NOT text-align)', () => {
    const root = renderTo(
      list([{ op: 'fillText', text: 'hi', font: { family: 'Inter', size: 24, weight: 700 }, paint: { kind: 'color', color: '#246' }, x: 12, y: 30, align: 'center' }]),
    );
    const div = Array.from(root.querySelectorAll('div')).find((d) => d.textContent === 'hi') as HTMLElement;
    expect(div).toBeTruthy();
    expect(div.style.left).toBe('12px');
    expect(div.style.top).toBe('30px');
    expect(div.style.color).toBe('rgb(34, 68, 102)'); // #246 normalized by jsdom
    // canvas textAlign anchors AROUND x; a shrink-wrapped div is left-anchored, so
    // `center` must shift by −50% of its own width (text-align would be a no-op).
    expect(div.style.transform).toBe('translate(-50%, -0.84em)');
    expect(div.style.lineHeight).toBe('1');
  });

  it('fillText alignment → the correct translateX per align (left 0 / center −50% / right −100%)', () => {
    const t = (align?: 'left' | 'center' | 'right'): string => {
      const root = renderTo(
        list([{ op: 'fillText', text: 'x', font: { family: 'X', size: 10 }, paint: { kind: 'color', color: '#000' }, x: 50, y: 50, ...(align ? { align } : {}) }]),
      );
      return (Array.from(root.querySelectorAll('div')).find((d) => d.textContent === 'x') as HTMLElement).style.transform;
    };
    expect(t('left')).toBe('translate(0px, -0.84em)');
    expect(t(undefined)).toBe('translate(0px, -0.84em)'); // no align → left-anchored
    expect(t('center')).toBe('translate(-50%, -0.84em)');
    expect(t('right')).toBe('translate(-100%, -0.84em)');
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

  it('re-rendering PATCHES in place (retained — element reused, stale text replaced)', () => {
    const b = new DomBackend(document);
    b.render(list([{ op: 'fillText', text: 'a', font: { family: 'X', size: 10 }, paint: { kind: 'color', color: '#000' }, x: 0, y: 0 }]));
    const div = b.root.querySelector('div');
    b.render(list([{ op: 'fillText', text: 'b', font: { family: 'X', size: 10 }, paint: { kind: 'color', color: '#000' }, x: 0, y: 0 }]));
    expect(b.root.querySelectorAll('div').length).toBe(1); // no leftover 'a' div
    expect(b.root.querySelector('div')).toBe(div); // SAME element object reused
    expect(b.root.querySelector('div')!.textContent).toBe('b'); // text patched
  });
});

// ---------------------------------------------------------------------------
// S3 retained reconciler — the design-agent Q4 breakage list (priority order):
//   #1 inline-edit state (caret/focus/selection) survives a re-render
//   #2 foreign / overlay DOM the host injected is never touched
//   #3 focus on the selected element
//   #4 text selection the user made across nodes
//   #5 event listeners the host attached
//   #6 CSS transitions/classes the host attached
// plus keying/structure regression guards for the retained tree.
// ---------------------------------------------------------------------------

/** Re-render the SAME backend with the same (or new) ids — the cross-frame form. */
function renderTwice(b: DomBackend, dl: DisplayList, ids?: readonly (string | undefined)[]): void {
  if (ids) b.setIds(ids);
  b.render(dl);
  if (ids) b.setIds(ids);
  b.render(dl);
}

const triangle: Resource = { kind: 'path', segs: [['M', 0, 0], ['L', 10, 0], ['L', 5, 10], ['Z']] };
const fillCmd = (): DrawCommand => ({ op: 'fillPath', path: 0, paint: { kind: 'color', color: '#000' } });
const textCmd = (text: string): DrawCommand => ({ op: 'fillText', text, font: { family: 'X', size: 10 }, paint: { kind: 'color', color: '#000' }, x: 0, y: 0 });

describe('DomBackend — S3 retention / Q4', () => {
  it('Q4#1 reference identity: same list twice reuses the SAME elements (idempotent)', () => {
    const b = new DomBackend(document);
    const dl = list([{ op: 'transform', m: [1, 0, 0, 1, 0, 0] }, fillCmd()], [triangle]);
    b.setIds(['x', 'x']);
    b.render(dl);
    const el = b.root.querySelector('[data-node-id="x"]');
    const count = b.root.querySelectorAll('*').length;
    expect(el).toBeTruthy();
    b.setIds(['x', 'x']);
    b.render(dl);
    expect(b.root.querySelector('[data-node-id="x"]')).toBe(el); // SAME object
    expect(b.root.querySelectorAll('*').length).toBe(count); // no new nodes
  });

  it('Q4#1 text NOT rewritten when unchanged; the Text node is mutated, not replaced, when it does change', () => {
    const b = new DomBackend(document);
    b.render(list([textCmd('hi')]));
    const div = b.root.querySelector('div')!;
    const tn = div.firstChild;
    expect(tn).toBeTruthy();
    b.render(list([textCmd('hi')])); // unchanged
    expect(div.firstChild).toBe(tn); // same Text object, never touched
    b.render(list([textCmd('ho')])); // changed
    expect(div.firstChild).toBe(tn); // still the SAME Text node (.data patched)
    expect(div.textContent).toBe('ho');
  });

  it('Q4#1 no mutation on unchanged: a host attr on the wrapper survives + same object', () => {
    const b = new DomBackend(document);
    const dl = list([{ op: 'transform', m: [1, 0, 0, 1, 2, 3] }], []);
    b.setIds(['t']);
    b.render(dl);
    const wrap = b.root.querySelector('[data-node-id="t"]') as HTMLElement;
    wrap.dataset['host'] = 'kept';
    b.setIds(['t']);
    b.render(dl);
    expect(b.root.querySelector('[data-node-id="t"]')).toBe(wrap);
    expect(wrap.dataset['host']).toBe('kept');
  });

  it('Q4#1 a changed prop mutates ONLY that attr; siblings are not recreated', () => {
    const b = new DomBackend(document);
    const dl1 = list([{ op: 'transform', m: [1, 0, 0, 1, 0, 0] }, fillCmd()], [triangle]);
    b.setIds(['g', 's']);
    b.render(dl1);
    const wrap = b.root.querySelector('[data-node-id="g"]') as HTMLElement;
    const svg = b.root.querySelector('[data-node-id="s"]')!.closest('svg');
    const dl2 = list([{ op: 'transform', m: [2, 0, 0, 2, 4, 6] }, fillCmd()], [triangle]);
    b.setIds(['g', 's']);
    b.render(dl2);
    expect(wrap.style.transform).toBe('matrix(2, 0, 0, 2, 4, 6)'); // updated
    expect(b.root.querySelector('[data-node-id="g"]')).toBe(wrap); // same object
    expect(b.root.querySelector('[data-node-id="s"]')!.closest('svg')).toBe(svg); // sibling untouched
  });

  it('Q4#1 inline-edit survival (rank #1): focus on a contentEditable survives a re-render', () => {
    const b = new DomBackend(document);
    document.body.appendChild(b.root); // focus needs a connected tree
    try {
      b.setIds(['edit']);
      b.render(list([textCmd('hi')]));
      const div = b.root.querySelector('[data-node-id="edit"]') as HTMLElement;
      // jsdom: set the ATTR (it reflects isContentEditable in real browsers but
      // the IDL setter doesn't reflect in jsdom) + tabIndex so .focus() takes.
      div.setAttribute('contenteditable', 'true');
      div.tabIndex = 0;
      div.focus();
      expect(document.activeElement).toBe(div);
      const tn = div.firstChild;
      b.setIds(['edit']);
      b.render(list([textCmd('hi')]));
      expect(document.activeElement).toBe(div); // focus preserved
      expect(div.firstChild).toBe(tn); // Text node preserved (caret intact)
    } finally {
      b.root.remove();
      b.dispose();
    }
  });

  it('Q4#1 isEditing freeze: a model text change under a live caret is frozen, then applies on blur', () => {
    const b = new DomBackend(document);
    document.body.appendChild(b.root);
    try {
      b.setIds(['edit']);
      b.render(list([textCmd('hello')]));
      const div = b.root.querySelector('[data-node-id="edit"]') as HTMLElement;
      div.setAttribute('contenteditable', 'true');
      div.tabIndex = 0;
      div.focus();
      expect(document.activeElement).toBe(div);
      const tn = div.firstChild;
      // an animation tick changes the model text WHILE the caret is live
      b.setIds(['edit']);
      b.render(list([textCmd('world')]));
      expect(div.firstChild).toBe(tn);
      expect(div.textContent).toBe('hello'); // FROZEN — caret not stomped
      div.blur();
      b.setIds(['edit']);
      b.render(list([textCmd('world')]));
      expect(div.textContent).toBe('world'); // freeze lifted
    } finally {
      b.root.remove();
      b.dispose();
    }
  });

  it('Q4#1 focus survives an unchanged re-render with a FOREIGN node positioned BEFORE the focused node (placement-move trap)', () => {
    const b = new DomBackend(document);
    document.body.appendChild(b.root); // focus needs a connected tree
    try {
      b.setIds(['edit']);
      b.render(list([textCmd('hi')]));
      const div = b.root.querySelector('[data-node-id="edit"]') as HTMLElement;
      div.setAttribute('contenteditable', 'true');
      div.tabIndex = 0;
      div.focus();
      expect(document.activeElement).toBe(div);
      const tn = div.firstChild;
      // host inserts a foreign overlay as the FIRST child — BEFORE the owned node.
      const overlay = document.createElement('div');
      overlay.className = 'gs-foreign';
      b.root.insertBefore(overlay, b.root.firstChild);
      // unchanged re-render: the owned focused node must NOT be relocated (which
      // would blur it) just because a foreign sibling now precedes it.
      b.setIds(['edit']);
      b.render(list([textCmd('hi')]));
      expect(document.activeElement).toBe(div); // focus preserved
      expect(div.firstChild).toBe(tn); // caret/Text node intact
      expect(b.root.querySelector('.gs-foreign')).toBe(overlay); // foreign survived
    } finally {
      b.root.remove();
      b.dispose();
    }
  });

  it('Q4#2 a FOREIGN node INSIDE a managed text div survives a text change (no textContent wipe)', () => {
    const b = new DomBackend(document);
    b.setIds(['t']);
    b.render(list([textCmd('hi')]));
    const div = b.root.querySelector('[data-node-id="t"]') as HTMLElement;
    // host injects a foreign badge as a sibling of the managed Text node, inside the div.
    const badge = document.createElement('span');
    badge.className = 'gs-badge';
    div.insertBefore(badge, div.firstChild);
    // the model text changes — the MANAGED Text node mutates; the badge is not wiped.
    b.setIds(['t']);
    b.render(list([textCmd('ho')]));
    expect(div.querySelector('.gs-badge')).toBe(badge); // foreign survived (no textContent=)
    expect(div.textContent).toContain('ho'); // managed text updated
  });

  it('Q4#2 foreign overlay (root child) survives a re-render', () => {
    const b = new DomBackend(document);
    b.render(list([fillCmd()], [triangle]));
    const overlay = document.createElement('div');
    overlay.className = 'gs-selection';
    b.root.appendChild(overlay);
    b.render(list([fillCmd()], [triangle]));
    expect(overlay.parentNode).toBe(b.root);
    expect(b.root.querySelector('.gs-selection')).toBe(overlay);
  });

  it('Q4#2 foreign overlay (child of a node wrapper) survives a re-render', () => {
    const b = new DomBackend(document);
    const dl = list([{ op: 'transform', m: [1, 0, 0, 1, 0, 0] }], []);
    b.setIds(['g']);
    b.render(dl);
    const wrap = b.root.querySelector('[data-node-id="g"]') as HTMLElement;
    const overlay = document.createElement('div');
    overlay.className = 'gs-handle';
    wrap.appendChild(overlay);
    b.setIds(['g']);
    b.render(dl);
    expect(overlay.parentNode).toBe(wrap);
    expect(wrap.querySelector('.gs-handle')).toBe(overlay);
  });

  it('Q4#2 foreign interleaved + reorder: owned svgs MOVE (not recreate); foreign stays', () => {
    const b = new DomBackend(document);
    b.setIds(['a', 'b']);
    b.render(list([fillCmd(), fillCmd()], [triangle]));
    const svgA = b.root.querySelector('[data-node-id="a"]')!.closest('svg')!;
    const svgB = b.root.querySelector('[data-node-id="b"]')!.closest('svg')!;
    // host injects a foreign node between the two svgs
    const foreign = document.createElement('div');
    foreign.className = 'gs-foreign';
    b.root.insertBefore(foreign, svgB);
    // re-render with B before A
    b.setIds(['b', 'a']);
    b.render(list([fillCmd(), fillCmd()], [triangle]));
    expect(b.root.querySelector('[data-node-id="a"]')!.closest('svg')).toBe(svgA); // moved, not recreated
    expect(b.root.querySelector('[data-node-id="b"]')!.closest('svg')).toBe(svgB);
    const order = Array.from(b.root.children).filter((c) => c.tagName.toLowerCase() === 'svg');
    expect(order).toEqual([svgB, svgA]); // DOM order now B, A
    expect(b.root.querySelector('.gs-foreign')).toBe(foreign); // foreign survived (same object)
  });

  it('Q4#2 stale-node removal + foreign retention', () => {
    const b = new DomBackend(document);
    b.setIds(['a', 'b']);
    b.render(list([textCmd('A'), textCmd('B')]));
    const foreign = document.createElement('div');
    foreign.className = 'gs-foreign';
    b.root.appendChild(foreign);
    b.setIds(['a']);
    b.render(list([textCmd('A')])); // B gone
    expect(b.root.querySelector('[data-node-id="b"]')).toBeNull();
    expect(b.root.querySelector('[data-node-id="a"]')).toBeTruthy();
    expect(b.root.querySelector('.gs-foreign')).toBe(foreign); // foreign retained
  });

  it('Q4#3 focus on the selected element is preserved across a re-render', () => {
    const b = new DomBackend(document);
    document.body.appendChild(b.root);
    try {
      b.setIds(['f']);
      b.render(list([textCmd('x')]));
      const el = b.root.querySelector('[data-node-id="f"]') as HTMLElement;
      el.tabIndex = 0;
      el.focus();
      expect(document.activeElement).toBe(el);
      b.setIds(['f']);
      b.render(list([textCmd('x')]));
      expect(document.activeElement).toBe(el);
    } finally {
      b.root.remove();
      b.dispose();
    }
  });

  it('Q4#4 cross-node text selection (Text-node identity proxy) survives', () => {
    const b = new DomBackend(document);
    b.setIds(['a', 'b']);
    b.render(list([textCmd('A'), textCmd('B')]));
    const divA = b.root.querySelector('[data-node-id="a"]')!;
    const divB = b.root.querySelector('[data-node-id="b"]')!;
    const tnA = divA.firstChild;
    const tnB = divB.firstChild;
    b.setIds(['a', 'b']);
    b.render(list([textCmd('A'), textCmd('B')]));
    expect(divA.firstChild).toBe(tnA);
    expect(divB.firstChild).toBe(tnB);
  });

  it('Q4#5 host event listeners on a node element survive a re-render', () => {
    const b = new DomBackend(document);
    const dl = list([textCmd('btn')]);
    b.setIds(['btn']);
    b.render(dl);
    const el = b.root.querySelector('[data-node-id="btn"]') as HTMLElement;
    let fired = 0;
    el.addEventListener('click', () => fired++);
    b.setIds(['btn']);
    b.render(dl);
    el.dispatchEvent(new Event('click'));
    expect(fired).toBe(1);
    expect(b.root.querySelector('[data-node-id="btn"]')).toBe(el);
  });

  it('Q4#6 host CSS transition / class persists across a re-render', () => {
    const b = new DomBackend(document);
    const dl = list([{ op: 'transform', m: [1, 0, 0, 1, 0, 0] }], []);
    b.setIds(['c']);
    b.render(dl);
    const el = b.root.querySelector('[data-node-id="c"]') as HTMLElement;
    el.style.transition = 'opacity 1s';
    el.classList.add('host-anim');
    b.setIds(['c']);
    b.render(dl);
    expect(el.style.transition).toBe('opacity 1s');
    expect(el.classList.contains('host-anim')).toBe(true);
  });
});

describe('DomBackend — S3 keying / structure regression guards', () => {
  it('deterministic def ids are stable across frames and keep referencing live defs', () => {
    const b = new DomBackend(document);
    const dl = list(
      [
        { op: 'clip', path: 0, rule: 'nonzero' },
        { op: 'fillPath', path: 0, paint: { kind: 'linear', from: [0, 0], to: [10, 0], stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] } },
      ],
      [triangle],
    );
    b.render(dl);
    const clipId = b.root.querySelector('clipPath')!.getAttribute('id')!;
    const gradId = b.root.querySelector('linearGradient')!.getAttribute('id')!;
    b.render(dl);
    expect(b.root.querySelector('clipPath')!.getAttribute('id')).toBe(clipId); // stable
    expect(b.root.querySelector('linearGradient')!.getAttribute('id')).toBe(gradId);
    // references still resolve to a live def
    expect(b.root.querySelector('div[style*="clip-path"]')!.getAttribute('style')).toContain(`url(#${clipId})`);
    expect(b.root.querySelector('svg path[fill^="url"]')!.getAttribute('fill')).toBe(`url(#${gradId})`);
  });

  it('a multi-command node (transform+fillPath sharing an id) reuses both, no key collision', () => {
    const b = new DomBackend(document);
    const dl = list([{ op: 'transform', m: [1, 0, 0, 1, 0, 0] }, fillCmd()], [triangle]);
    b.setIds(['rect', 'rect']);
    b.render(dl);
    const wrap = b.root.querySelector('div[style*="matrix"]');
    const svg = b.root.querySelector('svg');
    expect(wrap).toBeTruthy();
    expect(svg).toBeTruthy();
    b.setIds(['rect', 'rect']);
    b.render(dl);
    expect(b.root.querySelector('div[style*="matrix"]')).toBe(wrap);
    expect(b.root.querySelector('svg')).toBe(svg);
    expect(b.root.querySelectorAll('svg').length).toBe(1); // no duplicate from a key collision
  });

  it('id-less render is idempotent: stable element count + same object across frames', () => {
    const b = new DomBackend(document);
    const dl = list([{ op: 'transform', m: [1, 0, 0, 1, 0, 0] }, fillCmd()], [triangle]);
    b.render(dl); // no ids
    const n = b.root.querySelectorAll('*').length;
    const svg = b.root.querySelector('svg');
    b.render(dl);
    expect(b.root.querySelectorAll('*').length).toBe(n);
    expect(b.root.querySelector('svg')).toBe(svg);
  });

  it('nested cursor prune timing: inner stale draw removed; ancestor wrappers kept', () => {
    const b = new DomBackend(document);
    const dl2 = list(
      [
        { op: 'transform', m: [1, 0, 0, 1, 0, 0] },
        { op: 'pushGroup', opacity: 1, blend: 'source-over', filters: [] },
        fillCmd(),
        fillCmd(),
        { op: 'popGroup' },
      ],
      [triangle],
    );
    b.setIds(['t', 'g', 'p1', 'p2']);
    b.render(dl2);
    const wrap = b.root.querySelector('[data-node-id="t"]');
    const grp = b.root.querySelector('[data-node-id="g"]');
    expect(grp!.querySelectorAll('svg').length).toBe(2);
    const dl1 = list(
      [
        { op: 'transform', m: [1, 0, 0, 1, 0, 0] },
        { op: 'pushGroup', opacity: 1, blend: 'source-over', filters: [] },
        fillCmd(),
        { op: 'popGroup' },
      ],
      [triangle],
    );
    b.setIds(['t', 'g', 'p1']);
    b.render(dl1);
    expect(b.root.querySelector('[data-node-id="t"]')).toBe(wrap); // ancestor kept
    expect(b.root.querySelector('[data-node-id="g"]')).toBe(grp); // group kept
    expect(grp!.querySelectorAll('svg').length).toBe(1); // the 2nd fill pruned
  });
});

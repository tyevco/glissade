// @vitest-environment jsdom
// SPIKE — throwaway, not a shipped backend (0.20 backend-dom memo)
//
// Asserts the read-only DOM spike produces the expected DOM structure from a
// FIXED, hand-built DisplayList — de-risking the out-of-band-identity claim in
// docs/design/dom-backend.md. This test is NOT part of any shipped contract; it
// guards the spike only. No render/evaluate path is touched, so all 262 goldens
// stay byte-identical.

import { describe, it, expect } from 'vitest';
import type { DisplayList } from '../src/displayList.js';
import { renderDisplayListToDom, type NodeIdStream } from '../spike/dom-backend-spike.js';

// A fixed DisplayList: a transform wrapping a triangle fillPath, plus a label.
// Resource 0 is the triangle path.
const FIXTURE: DisplayList = {
  size: { w: 100, h: 80 },
  resources: [
    { kind: 'path', segs: [['M', 10, 10], ['L', 90, 10], ['L', 50, 70], ['Z']] },
  ],
  commands: [
    { op: 'transform', m: [1, 0, 0, 1, 5, 7] },
    { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#ff0000' } },
    { op: 'fillText', text: 'hi', font: { family: 'Inter', size: 16 }, paint: { kind: 'color', color: '#0000ff' }, x: 12, y: 40 },
  ],
};

// Out-of-band id stream, positional by command index (transform / path / text).
const IDS: NodeIdStream = ['grp', 'tri', 'label'];

describe('dom-backend spike (throwaway, 0.20 memo)', () => {
  it('renders fillPath -> <svg><path>, fillText -> <div>, transform -> nested element', () => {
    const root = renderDisplayListToDom(FIXTURE, document, IDS);

    // Root is the sized container.
    expect(root.getAttribute('data-gs-dom-spike')).toBe('');
    expect(root.style.width).toBe('100px');
    expect(root.style.height).toBe('80px');

    // transform -> a nested wrapper carrying a CSS matrix.
    const wrap = root.querySelector(':scope > div') as HTMLElement;
    expect(wrap).toBeTruthy();
    expect(wrap.style.transform).toBe('matrix(1, 0, 0, 1, 5, 7)');

    // fillPath nests UNDER the transform wrapper (transforms compose).
    const path = wrap.querySelector('svg > path') as SVGPathElement;
    expect(path).toBeTruthy();
    expect(path.getAttribute('d')).toBe('M10 10 L90 10 L50 70 Z');
    expect(path.getAttribute('fill')).toBe('#ff0000');

    // fillText -> a positioned <div>, also under the transform wrapper.
    const label = [...wrap.querySelectorAll('div')].find((d) => d.textContent === 'hi') as HTMLElement;
    expect(label).toBeTruthy();
    expect(label.style.left).toBe('12px');
    expect(label.style.top).toBe('40px');
    expect(label.style.color).toBe('rgb(0, 0, 255)');
  });

  it('stamps the OUT-OF-BAND id stream onto elements without touching the DisplayList', () => {
    // The fixture commands carry NO id field — identity rides alongside.
    expect('data-node-id' in (FIXTURE.commands[1] as object)).toBe(false);

    const root = renderDisplayListToDom(FIXTURE, document, IDS);
    expect(root.querySelector('[data-node-id="grp"]')).toBeTruthy();
    expect(root.querySelector('[data-node-id="tri"]')).toBeTruthy();
    expect(root.querySelector('[data-node-id="label"]')).toBeTruthy();
  });

  it('omits data-node-id when no id stream is supplied (DisplayList alone is identity-less)', () => {
    const root = renderDisplayListToDom(FIXTURE, document);
    expect(root.querySelector('[data-node-id]')).toBeNull();
    // Structure is still correct without identity — the IR carries the geometry.
    expect(root.querySelector('svg > path')).toBeTruthy();
  });
});

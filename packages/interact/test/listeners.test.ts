import { describe, expect, it } from 'vitest';
import { signal } from '@glissade/core';
import { Circle, createScene, Group, Rect, Text } from '@glissade/scene';
import { createListeners, hitTest } from '../src/index.js';

function buttonScene() {
  const btn = new Circle({ id: 'btn', radius: 50, position: [100, 100] });
  const card = new Rect({ id: 'card', width: 200, height: 100, position: [400, 100] });
  const scene = createScene({ size: { w: 800, h: 400 }, children: [btn, card] });
  return { scene, btn, card };
}

describe('hitTest (§C.3): geometric, topmost-first, interactive-only', () => {
  it('only nodes with interactive: true participate', () => {
    const { scene, btn } = buttonScene();
    expect(hitTest(scene, 100, 100)).toBeNull();
    btn.interactive = true;
    expect(hitTest(scene, 100, 100)).toBe(btn);
  });

  it('a circle is a circle, not its bounding square', () => {
    const { scene, btn } = buttonScene();
    btn.interactive = true;
    // (140, 140): inside the 100×100 bounding box, outside the radius-50 circle
    expect(hitTest(scene, 140, 140)).toBeNull();
    expect(hitTest(scene, 100, 145)).toBe(btn); // on-axis, within radius
  });

  it('rotated shapes test in node-local space via the inverse world matrix', () => {
    const rect = new Rect({ id: 'r', width: 200, height: 100, position: [300, 100], rotation: 45 });
    const scene = createScene({ size: { w: 800, h: 400 }, children: [rect] });
    rect.interactive = true;
    // (390, 100): inside the axis-aligned bounds, outside the rotated rect
    expect(hitTest(scene, 390, 100)).toBeNull();
    // (330, 130): rotates back to (~42.4, 0) — inside
    expect(hitTest(scene, 330, 130)).toBe(rect);
  });

  it('nested transforms compose: a child inside a translated, scaled group', () => {
    const dot = new Circle({ id: 'dot', radius: 10, position: [50, 0] });
    const g = new Group({ position: [200, 200], scale: [2, 2], children: [dot] });
    const scene = createScene({ size: { w: 800, h: 400 }, children: [g] });
    dot.interactive = true;
    expect(hitTest(scene, 300, 200)).toBe(dot); // 200 + 50·2
    expect(hitTest(scene, 300, 225)).toBeNull(); // 25 world px = 12.5 local > r
    expect(hitTest(scene, 300, 215)).toBe(dot);
  });

  it('topmost wins: paint order with zIndex reordering', () => {
    const below = new Rect({ id: 'below', width: 100, height: 100, position: [100, 100] });
    const above = new Rect({ id: 'above', width: 100, height: 100, position: [100, 100] });
    const scene = createScene({ size: { w: 800, h: 400 }, children: [below, above] });
    below.interactive = true;
    above.interactive = true;
    expect(hitTest(scene, 100, 100)).toBe(above); // later child draws on top
    below.zIndex.set(1);
    expect(hitTest(scene, 100, 100)).toBe(below); // zIndex flips paint order
  });

  it('hitArea overrides geometry — fat targets for thin nodes, groups become hittable', () => {
    const { scene, btn } = buttonScene();
    btn.interactive = true;
    btn.hitArea = { kind: 'circle', x: 0, y: 0, r: 80 };
    expect(hitTest(scene, 140, 140)).toBe(btn); // beyond the radius, inside the hit area

    const g = new Group({ position: [600, 300] });
    const scene2 = createScene({ size: { w: 800, h: 400 }, children: [g] });
    g.interactive = true;
    expect(hitTest(scene2, 600, 300)).toBeNull(); // a group has no geometry...
    g.hitArea = { kind: 'rect', x: -20, y: -20, w: 40, h: 40 };
    expect(hitTest(scene2, 610, 310)).toBe(g); // ...until it declares one
  });

  it('interactiveChildren: false prunes the subtree; opacity 0 never hits', () => {
    const inner = new Circle({ id: 'inner', radius: 30, position: [0, 0] });
    const g = new Group({ position: [100, 100], children: [inner] });
    const scene = createScene({ size: { w: 800, h: 400 }, children: [g] });
    inner.interactive = true;
    expect(hitTest(scene, 100, 100)).toBe(inner);
    g.interactiveChildren = false;
    expect(hitTest(scene, 100, 100)).toBeNull();
    g.interactiveChildren = true;
    inner.opacity.set(0);
    expect(hitTest(scene, 100, 100)).toBeNull(); // invisible nodes don't hit
  });

  it('text hit-boxes account for the baseline origin and align edge', () => {
    const label = new Text({ id: 'label', text: 'hello', fontSize: 20, position: [500, 200] });
    const scene = createScene({ size: { w: 800, h: 400 }, children: [label] });
    label.interactive = true;
    expect(hitTest(scene, 505, 200)).toBe(label); // just right of the origin, on the baseline
    expect(hitTest(scene, 495, 200)).toBeNull(); // left of a left-aligned origin
    expect(hitTest(scene, 505, 200 - 40)).toBeNull(); // far above the ascent
  });
});

// ---- listener flows ----------------------------------------------------------

interface FakePointerEvent {
  clientX: number;
  clientY: number;
  pointerType: string;
  isPrimary: boolean;
  button: number;
}

class FakeEl {
  handlers = new Map<string, (ev: FakePointerEvent) => void>();
  addEventListener(t: string, fn: (ev: FakePointerEvent) => void): void {
    this.handlers.set(t, fn);
  }
  removeEventListener(t: string): void {
    this.handlers.delete(t);
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 400 }; // 1:1 with the scene
  }
  fire(type: string, x: number, y: number, over: Partial<FakePointerEvent> = {}): void {
    this.handlers.get(type)?.({ clientX: x, clientY: y, pointerType: 'mouse', isPrimary: true, button: 0, ...over });
  }
}

function wired() {
  const { scene, btn, card } = buttonScene();
  const el = new FakeEl();
  const L = createListeners({ scene, element: el as unknown as Element });
  return { scene, btn, card, el, L };
}

describe('createListeners (§C.3): pointer events → machine inputs', () => {
  it('attaching a listener marks the node interactive implicitly', () => {
    const { btn, L } = wired();
    expect(btn.interactive).toBe(false);
    L.hover(btn, () => {});
    expect(btn.interactive).toBe(true);
  });

  it('hover follows pointer-over; touch-emulated hover is filtered', () => {
    const { btn, el, L } = wired();
    const hovered = signal(false);
    L.hover(btn, hovered);
    el.fire('pointermove', 100, 100);
    expect(hovered()).toBe(true);
    el.fire('pointermove', 700, 300);
    expect(hovered()).toBe(false);
    el.fire('pointermove', 100, 100, { pointerType: 'touch' });
    expect(hovered()).toBe(false); // no touch-emulated hover (Motion precedent)
    el.fire('pointermove', 100, 100);
    expect(hovered()).toBe(true);
    el.handlers.get('pointerleave')?.({ clientX: 0, clientY: 0, pointerType: 'mouse', isPrimary: true, button: 0 });
    expect(hovered()).toBe(false);
  });

  it('press is primary-pointer, down-over-target; click requires release over the same node', () => {
    const { btn, card, el, L } = wired();
    const pressed = signal(false);
    let clicks = 0;
    L.press(btn, pressed);
    L.click(btn, () => clicks++);
    L.click(card, () => {});

    el.fire('pointerdown', 100, 100);
    expect(pressed()).toBe(true);
    el.fire('pointerup', 100, 100);
    expect(pressed()).toBe(false);
    expect(clicks).toBe(1);

    // drag off the node: press releases, click cancels
    el.fire('pointerdown', 100, 100);
    el.fire('pointerup', 400, 100); // over card, not btn
    expect(pressed()).toBe(false);
    expect(clicks).toBe(1);

    // secondary button never presses
    el.fire('pointerdown', 100, 100, { button: 2 });
    expect(pressed()).toBe(false);
  });

  it('unregister and dispose stop event delivery', () => {
    const { btn, el, L } = wired();
    const hovered = signal(false);
    const off = L.hover(btn, hovered);
    el.fire('pointermove', 100, 100);
    expect(hovered()).toBe(true);
    el.fire('pointermove', 700, 300);
    off();
    el.fire('pointermove', 100, 100);
    expect(hovered()).toBe(false); // unregistered: no write
    L.dispose();
    expect(el.handlers.size).toBe(0);
  });
});

describe('Path hit testing (§C.3): fill-rule, not bounding box', () => {
  it('a star hits in its body, misses in the concave notches inside its bbox', async () => {
    const { Path } = await import('@glissade/scene');
    const v: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 80 : 30;
      v.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const zero = v.map(() => [0, 0] as [number, number]);
    const node = new Path({
      id: 'star',
      data: [{ closed: true, v, in: zero, out: zero }],
      fill: '#fff',
      position: [100, 100],
    });
    const scene = createScene({ size: { w: 200, h: 200 }, children: [node] });
    node.interactive = true;
    expect(hitTest(scene, 100, 100)).toBe(node); // center
    expect(hitTest(scene, 100, 100 - 70)).toBe(node); // up the arm at vertex 0
    // halfway between two arms at radius 60: inside the bbox, outside the fill
    const notch = ((1.5 / 10) * Math.PI * 2) - Math.PI / 2;
    expect(hitTest(scene, 100 + Math.cos(notch) * 60, 100 + Math.sin(notch) * 60)).toBeNull();
  });

  it('a reversed inner contour cuts a nonzero-winding hole', async () => {
    const { Path } = await import('@glissade/scene');
    const ringOf = (r: number, reverse: boolean) => {
      const v: [number, number][] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        v.push([Math.cos(a) * r, Math.sin(a) * r] as [number, number]);
      }
      if (reverse) v.reverse();
      const zero = v.map(() => [0, 0] as [number, number]);
      return { closed: true, v, in: zero, out: zero };
    };
    const node = new Path({
      id: 'ring',
      data: [ringOf(80, false), ringOf(40, true)],
      fill: '#fff',
      position: [100, 100],
    });
    const scene = createScene({ size: { w: 200, h: 200 }, children: [node] });
    node.interactive = true;
    expect(hitTest(scene, 160, 100)).toBe(node); // on the band
    expect(hitTest(scene, 100, 100)).toBeNull(); // in the hole
    expect(hitTest(scene, 195, 100)).toBeNull(); // outside entirely
  });
});

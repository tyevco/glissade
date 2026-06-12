/**
 * Listeners + geometric hit testing (§C.3): pointer events on scene nodes →
 * machine inputs. Hit testing is a topmost-first walk over interactive nodes —
 * per candidate, invert the cached worldMatrix and run a geometric
 * containsPoint per node type. Pixel/alpha-accurate picking is reserved
 * (Open Question 3); bounding-box-only testing was rejected as below table
 * stakes — a circular button must not hit-test as its bounding square.
 */

import { type PathValue, type Vec2 } from '@glissade/core';
import {
  applyToPoint,
  Circle,
  Group,
  ImageNode,
  invert,
  Node,
  Path,
  Rect,
  Text,
  Video,
  type HitArea,
  type Scene,
  type TextMeasurer,
} from '@glissade/scene';

function hitAreaContains(area: HitArea, p: Vec2): boolean {
  if (area.kind === 'circle') {
    const dx = p[0] - area.x;
    const dy = p[1] - area.y;
    return dx * dx + dy * dy <= area.r * area.r;
  }
  return p[0] >= area.x && p[0] <= area.x + area.w && p[1] >= area.y && p[1] <= area.y + area.h;
}

/** Fixed flattening for hit tests: 16 samples per cubic — deterministic and plenty at pointer scale. */
const FLATTEN = 16;

function flattenContour(c: PathValue[number]): Vec2[] {
  const pts: Vec2[] = [];
  const n = c.v.length;
  if (n === 0) return pts;
  const cubic = (i: number, j: number): void => {
    const p0 = c.v[i]!;
    const p1: Vec2 = [p0[0] + c.out[i]![0], p0[1] + c.out[i]![1]];
    const p3 = c.v[j]!;
    const p2: Vec2 = [p3[0] + c.in[j]![0], p3[1] + c.in[j]![1]];
    for (let s = 1; s <= FLATTEN; s++) {
      const t = s / FLATTEN;
      const u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  };
  pts.push(c.v[0]!);
  for (let i = 0; i < n - 1; i++) cubic(i, i + 1);
  if (c.closed && n > 1) cubic(n - 1, 0);
  return pts; // open contours close implicitly for the fill test, like canvas fill()
}

/** Nonzero-winding fill test over flattened contours (§C.3: a path fills as a path). */
function pathContains(value: PathValue, p: Vec2): boolean {
  let winding = 0;
  for (const c of value) {
    const poly = flattenContour(c);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      if (a[1] <= p[1]) {
        if (b[1] > p[1] && (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]) > 0) winding++;
      } else if (b[1] <= p[1] && (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]) < 0) {
        winding--;
      }
    }
  }
  return winding !== 0;
}

/** Geometric shape test in node-local coordinates; hitArea overrides the geometry. */
export function containsPoint(node: Node, p: Vec2, measurer: TextMeasurer): boolean {
  if (node.hitArea) return hitAreaContains(node.hitArea, p);
  if (node instanceof Path) {
    return pathContains(node.data(), p);
  }
  if (node instanceof Circle) {
    const r = node.radius();
    return p[0] * p[0] + p[1] * p[1] <= r * r;
  }
  if (node instanceof Rect) {
    return Math.abs(p[0]) <= node.width() / 2 && Math.abs(p[1]) <= node.height() / 2;
  }
  if (node instanceof ImageNode || node instanceof Video) {
    return Math.abs(p[0]) <= node.width() / 2 && Math.abs(p[1]) <= node.height() / 2;
  }
  if (node instanceof Text) {
    // text draws from a baseline origin at its align edge (§3.6). drawOffset,
    // not flowOffset: the inverse worldMatrix already lands the point in DRAW
    // space, where any anchor shift has been applied.
    const size = node.intrinsicSize(measurer);
    const off = node.drawOffset(measurer);
    return p[0] >= off.x && p[0] <= off.x + size.w && p[1] >= off.y && p[1] <= off.y + size.h;
  }
  return false; // Group/unknown nodes need an explicit hitArea to be hittable
}

/**
 * Topmost-first over nodes with `interactive: true`: O(interactive nodes) per
 * call, one 2×3 inverse each — worldMatrix is a cached computed (§3.1), so
 * unmoved subtrees cost a cache read.
 */
export function hitTest(scene: Scene, x: number, y: number): Node | null {
  const p: Vec2 = [x, y];
  const visit = (node: Node): Node | null => {
    if (node.opacity() <= 0) return null; // invisible subtrees don't draw (emit() skips) or hit
    if (node instanceof Group && node.interactiveChildren) {
      // topmost-first = reverse paint order (child order, locally reordered by zIndex)
      const sorted = node.children
        .map((n, i) => ({ n, i }))
        .sort((a, b) => a.n.zIndex() - b.n.zIndex() || a.i - b.i);
      for (let i = sorted.length - 1; i >= 0; i--) {
        const hit = visit(sorted[i]!.n);
        if (hit) return hit;
      }
    }
    if (!node.interactive) return null;
    const inv = invert(node.worldMatrix());
    if (!inv) return null;
    return containsPoint(node, applyToPoint(inv, p), scene.textMeasurer) ? node : null;
  };
  return visit(scene.root);
}

/** A machine input's set, or any boolean sink. */
export type BoolSink = { set(value: boolean): void } | ((value: boolean) => void);
// signals are callable, so probe for .set before treating a function as the sink
const sink = (s: BoolSink): ((v: boolean) => void) =>
  typeof (s as { set?: unknown }).set === 'function'
    ? (v) => (s as { set(value: boolean): void }).set(v)
    : (s as (v: boolean) => void);

export interface Listeners {
  /** Boolean input follows pointer-over; touch-emulated hover is filtered (Motion precedent). */
  hover(node: Node, input: BoolSink): () => void;
  /** Primary pointer only: true on down-over-target, false on release. */
  press(node: Node, input: BoolSink): () => void;
  /** Fires only if release lands over the same node; anything else cancels. */
  click(node: Node, fn: () => void): () => void;
  dispose(): void;
}

export interface ListenersOptions {
  scene: Scene;
  /** Event source — usually the canvas element. */
  element: Element;
  /** Client coords → scene coords; default scales the element box to scene.size. */
  toScene?: (clientX: number, clientY: number) => Vec2;
}

export function createListeners(opts: ListenersOptions): Listeners {
  const { scene, element } = opts;
  const toScene =
    opts.toScene ??
    ((cx: number, cy: number): Vec2 => {
      const rect = element.getBoundingClientRect();
      return [
        (cx - rect.left) * (rect.width > 0 ? scene.size.w / rect.width : 1),
        (cy - rect.top) * (rect.height > 0 ? scene.size.h / rect.height : 1),
      ];
    });

  const hovers = new Map<Node, Set<(v: boolean) => void>>();
  const presses = new Map<Node, Set<(v: boolean) => void>>();
  const clicks = new Map<Node, Set<() => void>>();
  let hoverNode: Node | null = null;
  let pressNode: Node | null = null;

  const hitAt = (ev: PointerEvent): Node | null => {
    const [x, y] = toScene(ev.clientX, ev.clientY);
    return hitTest(scene, x, y);
  };

  const setHover = (next: Node | null): void => {
    if (next === hoverNode) return;
    if (hoverNode) for (const w of hovers.get(hoverNode) ?? []) w(false);
    hoverNode = next;
    if (next) for (const w of hovers.get(next) ?? []) w(true);
  };

  const onMove = (ev: PointerEvent): void => {
    if (ev.pointerType === 'touch') return; // no touch-emulated hover
    setHover(hitAt(ev));
  };
  const onLeave = (): void => setHover(null);
  const onDown = (ev: PointerEvent): void => {
    if (!ev.isPrimary || ev.button !== 0) return;
    pressNode = hitAt(ev);
    if (pressNode) for (const w of presses.get(pressNode) ?? []) w(true);
  };
  const onUp = (ev: PointerEvent): void => {
    if (!ev.isPrimary) return;
    const down = pressNode;
    pressNode = null;
    if (!down) return;
    for (const w of presses.get(down) ?? []) w(false);
    if (hitAt(ev) === down) for (const f of clicks.get(down) ?? []) f();
  };

  element.addEventListener('pointermove', onMove as EventListener);
  element.addEventListener('pointerleave', onLeave as EventListener);
  element.addEventListener('pointerdown', onDown as EventListener);
  element.addEventListener('pointerup', onUp as EventListener);

  function register<T>(map: Map<Node, Set<T>>, node: Node, fn: T): () => void {
    node.interactive = true; // §C.3: set implicitly by attaching a listener
    let set = map.get(node);
    if (!set) {
      set = new Set();
      map.set(node, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  return {
    hover: (node, input) => register(hovers, node, sink(input)),
    press: (node, input) => register(presses, node, sink(input)),
    click: (node, fn) => register(clicks, node, fn),
    dispose() {
      element.removeEventListener('pointermove', onMove as EventListener);
      element.removeEventListener('pointerleave', onLeave as EventListener);
      element.removeEventListener('pointerdown', onDown as EventListener);
      element.removeEventListener('pointerup', onUp as EventListener);
      hovers.clear();
      presses.clear();
      clicks.clear();
      hoverNode = null;
      pressNode = null;
    },
  };
}

/**
 * `@glissade/scene/grid` — `Grid()`: a build-time CSS-grid-style track resolver
 * (0.20, DESIGN.md §3.2 "Fork B: scene-side track resolver"). Like `each()` /
 * `splitText()`, it is a PURE BUILD-TIME FAN-OUT — NOT a Yoga feature. It
 * resolves a column-track spec (uniform `fr` fractions and/or fixed px) + gaps
 * into cell positions, then emits a `Group` of the SAME child nodes, each moved
 * to its cell center via its ordinary `position` signal. Nothing executes at
 * play time; it stamps NO id and registers NO new target, so `evaluate()` stays
 * a pure function of time and the goldens hold by construction.
 *
 * SEPARATE entry point with its own budget (mirrors `each()`/`scene/layout`/
 * `scene/type`/`scene/motion`) — the base embed never pays for it. Re-exported
 * onto the `@glissade/browser` IIFE so `window.glissade.Grid` survives.
 *
 * By default it is POSITION-ONLY: it places each child at the center of its cell
 * and children keep their own intrinsic size. Pass `stretch: true` (0.25) to also
 * SIZE each child to its cell — the resolved column-track width becomes the
 * child's `width`, and `cellHeight` its `height` (a plain `signal.set`, only for
 * children that expose those signals — Rect/Image).
 *
 *   const board = Grid({
 *     columns: 3,            // 3 equal-fr columns
 *     gap: 16,
 *     cellHeight: 80,        // row pitch (px) — required for >1 row
 *     width: 600,            // total content width the fr tracks divide
 *     children: cards,       // row-major: child[i] → row floor(i/3), col i%3
 *   });
 *   // scene children: [board]
 */

import { Node, type NodeProps } from './node.js';
import { Group } from './nodes.js';

export class GridError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GridError';
  }
}

/**
 * A single column track. A bare number is a FIXED px width; `{ fr }` is a
 * flexible track that shares the leftover width (after fixed tracks + gaps)
 * proportionally — the CSS `fr` unit. The array form `columns: [1, { fr: 1 }, …]`
 * mixes them; the scalar form `columns: 3` is sugar for three equal `{ fr: 1 }`.
 */
export type GridTrack = number | { fr: number };

export interface GridProps extends NodeProps {
  /**
   * Column tracks. A number N is sugar for N equal `fr` columns; an array spells
   * each track (`5` = 5px fixed, `{ fr: 2 }` = a 2-fraction flexible track).
   */
  columns: number | readonly GridTrack[];
  /** The nodes to place, row-major (child[i] → row floor(i/cols), col i%cols). */
  children?: Node[];
  /** Gap between columns AND rows (px). Overridden per-axis by columnGap/rowGap. */
  gap?: number;
  /** Horizontal gap between columns (px). Defaults to `gap`. */
  columnGap?: number;
  /** Vertical gap between rows (px). Defaults to `gap`. */
  rowGap?: number;
  /**
   * Total content width the tracks divide (px). REQUIRED when any `fr` track is
   * present (an `fr` needs a total to resolve against). Fixed-only track lists
   * may omit it — the width is then the sum of the fixed tracks + gaps.
   */
  width?: number;
  /**
   * Row pitch (px) — the center-to-center distance between rows is
   * `cellHeight + rowGap`. REQUIRED when the children span more than one row.
   * (v1 is position-only, so the grid does not measure child heights.)
   */
  cellHeight?: number;
  /**
   * Stretch each child to fill its cell (0.25): sets the child's `width` to its
   * resolved column-track width and, when `cellHeight` is given, its `height` to
   * `cellHeight` — a plain `signal.set`, so a later explicit bind still wins.
   * Only children that expose a settable `width`/`height` signal (Rect/Image) are
   * sized; others (Circle/Text/Path) keep their own size and are just positioned.
   * Default false (position-only, byte-identical to v1).
   */
  stretch?: boolean;
}

/** Resolve the column spec into per-column [centerX] offsets from the grid's left edge. */
function resolveColumns(
  spec: number | readonly GridTrack[],
  columnGap: number,
  totalWidth: number | undefined,
): { centers: number[]; width: number; widths: number[] } {
  const tracks: GridTrack[] =
    typeof spec === 'number'
      ? (() => {
          if (!Number.isInteger(spec) || spec < 1) {
            throw new GridError(`Grid columns must be a positive integer (got ${spec})`);
          }
          return Array.from({ length: spec }, () => ({ fr: 1 }) as GridTrack);
        })()
      : [...spec];

  if (tracks.length === 0) throw new GridError('Grid needs at least one column');

  const cols = tracks.length;
  const gapTotal = columnGap * (cols - 1);
  const fixedTotal: number = tracks.reduce<number>((s, t) => s + (typeof t === 'number' ? t : 0), 0);
  const frTotal: number = tracks.reduce<number>((s, t) => s + (typeof t === 'number' ? 0 : t.fr), 0);

  let widths: number[];
  let width: number;
  if (frTotal > 0) {
    if (totalWidth === undefined) {
      throw new GridError('Grid with fr columns needs an explicit `width` to resolve fractions against');
    }
    const free = Math.max(0, totalWidth - fixedTotal - gapTotal);
    widths = tracks.map((t) => (typeof t === 'number' ? t : (free * t.fr) / frTotal));
    width = totalWidth;
  } else {
    // fixed-only: the grid is exactly the sum of tracks + gaps (width optional)
    widths = tracks.map((t) => t as number);
    width = totalWidth ?? fixedTotal + gapTotal;
  }

  const centers: number[] = [];
  let x = 0;
  for (let c = 0; c < cols; c++) {
    centers.push(x + widths[c]! / 2);
    x += widths[c]! + columnGap;
  }
  return { centers, width, widths };
}

/**
 * Lay `children` out into a column grid and return a `Group` holding them, each
 * repositioned to its cell center. Center-anchored: the grid's own origin is the
 * center of its content box, so child positions are symmetric about [0, 0]
 * (matching every other glissade node's center-anchor convention).
 *
 * The children are NOT cloned — their `position` signal is SET to the resolved
 * cell center (a plain `signal.set`, so a later bind still wins if the author
 * rebinds it). Pass freshly constructed nodes for a clean, deterministic layout.
 */
export function Grid(props: GridProps): Group {
  const { columns, gap = 0, columnGap, rowGap, width, cellHeight, stretch = false } = props;
  const children = props.children ?? [];
  const colGap = columnGap ?? gap;
  const rowGapPx = rowGap ?? gap;

  const { centers, width: gridWidth, widths: colWidths } = resolveColumns(columns, colGap, width);
  const cols = centers.length;
  const rows = Math.ceil(children.length / cols);

  if (rows > 1 && cellHeight === undefined) {
    throw new GridError('Grid spanning more than one row needs `cellHeight` (the row pitch) — v1 is position-only and does not measure child heights');
  }
  const rowPitch = (cellHeight ?? 0) + rowGapPx;
  const gridHeight = rows > 0 ? rows * (cellHeight ?? 0) + (rows - 1) * rowGapPx : 0;

  // center the content box on the group origin: cell centers are offset by half
  // the grid extent so the whole grid is symmetric about [0, 0].
  const ox = -gridWidth / 2;
  const oy = -gridHeight / 2;

  children.forEach((child, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = ox + centers[col]!;
    const cy = oy + row * rowPitch + (cellHeight ?? 0) / 2;
    child.position.set([cx, cy]);
    if (stretch) {
      setDim(child, 'width', colWidths[col]!);
      if (cellHeight !== undefined) setDim(child, 'height', cellHeight);
    }
  });

  const groupProps: NodeProps & { children: Node[] } = { children, ...stripGridOnly(props) };
  return new Group(groupProps);
}

/** Set a child's `width`/`height` signal IF it exposes one (Rect/Image do;
 *  Circle/Text/Path don't) — a plain `.set`, so a later explicit bind still wins. */
function setDim(child: Node, prop: 'width' | 'height', value: number): void {
  // a BindableSignal is a CALLABLE (typeof 'function') carrying a `.set` method.
  const sig = (child as unknown as Record<string, unknown>)[prop];
  if (sig != null && typeof (sig as { set?: unknown }).set === 'function') {
    (sig as { set: (v: number) => void }).set(value);
  }
}

/** Strip Grid's own props so the rest (id/position/opacity/…) pass to the Group. */
function stripGridOnly(props: GridProps): NodeProps {
  const { columns, children, gap, columnGap, rowGap, width, cellHeight, stretch, ...nodeProps } = props;
  void columns;
  void children;
  void gap;
  void columnGap;
  void rowGap;
  void width;
  void cellHeight;
  void stretch;
  return nodeProps;
}

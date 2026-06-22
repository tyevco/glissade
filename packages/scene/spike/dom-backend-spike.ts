// SPIKE — throwaway, not a shipped backend (0.20 backend-dom memo)
//
// A minimal, READ-ONLY proof that a fixed DisplayList subset can be rendered to
// a DOM tree, to de-risk the "out-of-band node identity" claim in
// docs/design/dom-backend.md. It is NOT wired into any package export, has NO
// injection refactor, and makes NO change to the DisplayList IR.
//
// Scope, deliberately tiny:
//   - `fillPath`   -> an <svg><path d="…"> element
//   - `fillText`   -> a positioned <div>
//   - `transform`  -> a wrapping <div> carrying a CSS matrix(...) transform
//
// It consumes the SAME DrawCommand[] the canvas/Skia backends consume — proving
// a DOM renderer satisfies the §3.4 "consume the identical DisplayList" contract
// without touching the bytes those backends see. Identity (data-node-id) is fed
// from an OUT-OF-BAND id stream the spike accepts alongside the command list;
// the DrawCommands themselves stay identity-less, exactly as shipped.

import type {
  DisplayList,
  DrawCommand,
  PathSeg,
  Paint,
} from '../src/displayList.js';
import type { Mat2x3 } from '../src/matrix.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The out-of-band identity stream: one optional stable id per command INDEX,
 * produced by a scene-graph walk in the same stable order `emit()` already uses
 * (child-array order, locally reordered by zIndex — see Group.draw in nodes.ts).
 * The DisplayList stays byte-identical; ids ride alongside, keyed positionally.
 */
export type NodeIdStream = readonly (string | undefined)[];

/** Resolve a solid fill color from a Paint; the spike only handles `kind:'color'`. */
function solidColor(paint: Paint): string {
  return paint.kind === 'color' ? paint.color : '#000';
}

/** Turn a PathSeg[] into an SVG `d` attribute (M/L/C/Q/Z subset; E is skipped). */
function segsToD(segs: readonly PathSeg[]): string {
  const parts: string[] = [];
  for (const seg of segs) {
    switch (seg[0]) {
      case 'M':
        parts.push(`M${seg[1]} ${seg[2]}`);
        break;
      case 'L':
        parts.push(`L${seg[1]} ${seg[2]}`);
        break;
      case 'C':
        parts.push(`C${seg[1]} ${seg[2]} ${seg[3]} ${seg[4]} ${seg[5]} ${seg[6]}`);
        break;
      case 'Q':
        parts.push(`Q${seg[1]} ${seg[2]} ${seg[3]} ${seg[4]}`);
        break;
      case 'Z':
        parts.push('Z');
        break;
      default:
        // 'E' (ellipse arc) is out of the spike subset.
        break;
    }
  }
  return parts.join(' ');
}

/** CSS `matrix(a,b,c,d,e,f)` from the IR's row-major Mat2x3 `[a,b,c,d,e,f]`. */
function cssMatrix(m: Mat2x3): string {
  return `matrix(${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}, ${m[4]}, ${m[5]})`;
}

/**
 * Render a fixed DisplayList subset to a detached DOM subtree.
 *
 * Returns the root container. `transform` commands open a nested wrapper that
 * subsequent draws live under (cleared by the next `transform`/`save`), mirroring
 * how the canvas backend pushes a CTM. This is a STRUCTURAL proof, not a parity
 * renderer — see the memo's "preview / non-parity" section.
 */
export function renderDisplayListToDom(
  list: DisplayList,
  doc: Document,
  ids: NodeIdStream = [],
): HTMLElement {
  const root = doc.createElement('div');
  root.setAttribute('data-gs-dom-spike', '');
  root.style.position = 'relative';
  root.style.width = `${list.size.w}px`;
  root.style.height = `${list.size.h}px`;

  // Resolve a path ResourceId to its segments.
  const pathSegs = (id: number): readonly PathSeg[] => {
    const res = list.resources[id];
    return res && res.kind === 'path' ? res.segs : [];
  };

  // Where draws currently land. A `transform` opens a nested wrapper under which
  // following draws nest, so transforms compose as nested element transforms.
  let cursor: HTMLElement = root;
  const stack: HTMLElement[] = [];

  const stamp = (el: Element, i: number): void => {
    const id = ids[i];
    if (id !== undefined) el.setAttribute('data-node-id', id);
  };

  list.commands.forEach((cmd: DrawCommand, i: number) => {
    switch (cmd.op) {
      case 'save': {
        stack.push(cursor);
        break;
      }
      case 'restore': {
        cursor = stack.pop() ?? root;
        break;
      }
      case 'transform': {
        const wrap = doc.createElement('div');
        wrap.style.position = 'absolute';
        wrap.style.transformOrigin = '0 0';
        wrap.style.transform = cssMatrix(cmd.m);
        stamp(wrap, i);
        cursor.appendChild(wrap);
        cursor = wrap;
        break;
      }
      case 'fillPath': {
        const svg = doc.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', String(list.size.w));
        svg.setAttribute('height', String(list.size.h));
        (svg as unknown as HTMLElement).style.position = 'absolute';
        const path = doc.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', segsToD(pathSegs(cmd.path)));
        path.setAttribute('fill', solidColor(cmd.paint));
        stamp(path, i);
        svg.appendChild(path);
        cursor.appendChild(svg);
        break;
      }
      case 'fillText': {
        const div = doc.createElement('div');
        div.style.position = 'absolute';
        div.style.left = `${cmd.x}px`;
        div.style.top = `${cmd.y}px`;
        div.style.font = `${cmd.font.size}px ${cmd.font.family}`;
        div.style.color = solidColor(cmd.paint);
        if (cmd.align) div.style.textAlign = cmd.align;
        div.textContent = cmd.text;
        stamp(div, i);
        cursor.appendChild(div);
        break;
      }
      default:
        // Every other op (clip / strokePath / drawImage / pushGroup / popGroup)
        // is out of the spike subset — the memo stages those into a real backend.
        break;
    }
  });

  return root;
}

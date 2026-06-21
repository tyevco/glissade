/**
 * '@glissade/scene/path': the SVG `d`-string parser, a SEPARATELY-BUDGETED
 * entry point (mirrors '@glissade/scene/layout'). The base scene index — and
 * thus the base embed path — never pays for this parser; `Path({ data })` on a
 * bare string throws a clear error pointing here (see `coercePathData`).
 *
 * Usage:
 *   import { pathFromSvg } from '@glissade/scene/path';
 *   new Path({ data: pathFromSvg('M0 0 L40 0') });
 * or, in the single-file browser bundle: `window.glissade.pathFromSvg('…')`.
 */

import { type PathValue } from '@glissade/core';
import { type PathSeg } from './displayList.js';
import { pathFromSegs } from './nodes.js';

/**
 * Minimal SVG `<path d>` tokenizer → `PathSeg[]`, kept inside `scene` so it
 * never imports `@glissade/svg` (that would invert the enforced dependency
 * direction, scene ← svg). Handles the common command set: M/m L/l H/h V/v
 * C/c Q/q Z/z (absolute + relative, implicit-repeat per spec). For the FULL set
 * (S/T/A smooth-curves + arcs, with reflection), import a `.svg` through
 * `@glissade/svg`'s `parseSvgPath`; this lean copy covers hand-written `data`
 * strings. Unknown commands are skipped.
 */
export function parseSvgPathData(d: string): PathSeg[] {
  const tokens = d.match(/[MmLlHhVvCcQqZz]|-?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g) ?? [];
  const segs: PathSeg[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevCmd = '';
  const num = (): number => Number(tokens[i++]);
  const isCmd = (t: string | undefined): boolean => !!t && /^[MmLlHhVvCcQqZz]$/.test(t);
  while (i < tokens.length) {
    let cmd = tokens[i]!;
    if (isCmd(cmd)) i++;
    else cmd = prevCmd === 'M' ? 'L' : prevCmd === 'm' ? 'l' : prevCmd; // implicit repeat (M→L)
    if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': {
        const x = num() + (rel ? cx : 0);
        const y = num() + (rel ? cy : 0);
        cx = x; cy = y; sx = x; sy = y;
        segs.push(['M', x, y]);
        break;
      }
      case 'L': {
        const x = num() + (rel ? cx : 0);
        const y = num() + (rel ? cy : 0);
        cx = x; cy = y;
        segs.push(['L', x, y]);
        break;
      }
      case 'H': {
        const x = num() + (rel ? cx : 0);
        cx = x;
        segs.push(['L', x, cy]);
        break;
      }
      case 'V': {
        const y = num() + (rel ? cy : 0);
        cy = y;
        segs.push(['L', cx, y]);
        break;
      }
      case 'C': {
        const x1 = num() + (rel ? cx : 0);
        const y1 = num() + (rel ? cy : 0);
        const x2 = num() + (rel ? cx : 0);
        const y2 = num() + (rel ? cy : 0);
        const x = num() + (rel ? cx : 0);
        const y = num() + (rel ? cy : 0);
        cx = x; cy = y;
        segs.push(['C', x1, y1, x2, y2, x, y]);
        break;
      }
      case 'Q': {
        const x1 = num() + (rel ? cx : 0);
        const y1 = num() + (rel ? cy : 0);
        const x = num() + (rel ? cx : 0);
        const y = num() + (rel ? cy : 0);
        cx = x; cy = y;
        segs.push(['Q', x1, y1, x, y]);
        break;
      }
      case 'Z': {
        segs.push(['Z']);
        cx = sx; cy = sy;
        break;
      }
      default:
        i++; // skip an unsupported command token rather than spinning
        break;
    }
    prevCmd = cmd;
  }
  return segs;
}

/**
 * Convenience: an SVG `d` string → `PathValue` (the contour form `Path.data`
 * wants), via `parseSvgPathData` → `pathFromSegs`. Pass the result to a Path:
 * `new Path({ data: pathFromSvg('M0 0 …') })`.
 */
export function pathFromSvg(d: string): PathValue {
  return pathFromSegs(parseSvgPathData(d));
}

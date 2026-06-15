/**
 * SVG `<path d>` parser → glissade `PathSeg[]`. Handles the full command set
 * (M L H V C S Q T A Z + relative variants, with smooth-curve reflection), and
 * converts arcs (A) to glissade's native 'E' ellipse-arc segment via the
 * endpoint→center parameterization. The output feeds `pathFromSegs` →
 * `PathValue`. Pure and deterministic.
 */

import type { PathSeg } from '@glissade/scene';

const TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g;

type Token = { cmd: string } | { num: number };

function tokenize(d: string): Token[] {
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(d)) !== null) {
    if (m[1] !== undefined) out.push({ cmd: m[1] });
    else out.push({ num: parseFloat(m[2]!) });
  }
  return out;
}

/** SVG endpoint-arc → glissade 'E' segment (center parameterization). */
function arcToE(x1: number, y1: number, rx: number, ry: number, phiDeg: number, large: number, sweep: number, x2: number, y2: number): PathSeg | null {
  if (rx === 0 || ry === 0) return null; // degenerate → caller emits a line
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;
  // scale radii up if they can't span the chord
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const sign = large !== sweep ? 1 : -1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * (rx * y1p)) / ry;
  const cyp = (co * -(ry * x1p)) / rx;
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
  const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (sweep === 0 && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep === 1 && dTheta < 0) dTheta += 2 * Math.PI;
  return ['E', cx, cy, rx, ry, phi, theta1, theta1 + dTheta];
}

/**
 * Parse an SVG path `d` string into `PathSeg[]`. Unknown/degenerate inputs are
 * skipped gracefully rather than throwing.
 */
export function parseSvgPath(d: string): PathSeg[] {
  const toks = tokenize(d);
  const segs: PathSeg[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastCtrlX = 0;
  let lastCtrlY = 0;
  let prevCmd = '';
  const num = (): number => {
    const t = toks[i++];
    return t && 'num' in t ? t.num : NaN;
  };
  const hasNum = (): boolean => {
    const t = toks[i];
    return !!t && 'num' in t;
  };
  while (i < toks.length) {
    const t = toks[i];
    let cmd: string;
    if (t && 'cmd' in t) {
      cmd = t.cmd;
      i++;
    } else {
      // implicit repeat of the previous command (M→L, m→l per spec)
      cmd = prevCmd === 'M' ? 'L' : prevCmd === 'm' ? 'l' : prevCmd;
      if (!cmd) break;
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    switch (C) {
      case 'M': {
        const x = num() + (rel ? cx : 0);
        const y = num() + (rel ? cy : 0);
        cx = x;
        cy = y;
        sx = x;
        sy = y;
        segs.push(['M', x, y]);
        break;
      }
      case 'L': {
        const x = num() + (rel ? cx : 0);
        const y = num() + (rel ? cy : 0);
        cx = x;
        cy = y;
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
        segs.push(['C', x1, y1, x2, y2, x, y]);
        lastCtrlX = x2;
        lastCtrlY = y2;
        cx = x;
        cy = y;
        break;
      }
      case 'S': {
        const reflect = prevCmd.toUpperCase() === 'C' || prevCmd.toUpperCase() === 'S';
        const x1 = reflect ? 2 * cx - lastCtrlX : cx;
        const y1 = reflect ? 2 * cy - lastCtrlY : cy;
        const x2 = num() + (rel ? cx : 0);
        const y2 = num() + (rel ? cy : 0);
        const x = num() + (rel ? cx : 0);
        const y = num() + (rel ? cy : 0);
        segs.push(['C', x1, y1, x2, y2, x, y]);
        lastCtrlX = x2;
        lastCtrlY = y2;
        cx = x;
        cy = y;
        break;
      }
      case 'Q': {
        const x1 = num() + (rel ? cx : 0);
        const y1 = num() + (rel ? cy : 0);
        const x = num() + (rel ? cx : 0);
        const y = num() + (rel ? cy : 0);
        segs.push(['Q', x1, y1, x, y]);
        lastCtrlX = x1;
        lastCtrlY = y1;
        cx = x;
        cy = y;
        break;
      }
      case 'T': {
        const reflect = prevCmd.toUpperCase() === 'Q' || prevCmd.toUpperCase() === 'T';
        const x1 = reflect ? 2 * cx - lastCtrlX : cx;
        const y1 = reflect ? 2 * cy - lastCtrlY : cy;
        const x = num() + (rel ? cx : 0);
        const y = num() + (rel ? cy : 0);
        segs.push(['Q', x1, y1, x, y]);
        lastCtrlX = x1;
        lastCtrlY = y1;
        cx = x;
        cy = y;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num();
        const sweep = num();
        const x = num() + (rel ? cx : 0);
        const y = num() + (rel ? cy : 0);
        const e = arcToE(cx, cy, rx, ry, rot, large, sweep, x, y);
        segs.push(e ?? ['L', x, y]);
        cx = x;
        cy = y;
        break;
      }
      case 'Z': {
        segs.push(['Z']);
        cx = sx;
        cy = sy;
        break;
      }
      default:
        i++; // skip unknown
        break;
    }
    prevCmd = cmd;
    // guard against malformed input that didn't consume numbers
    if (C !== 'Z' && !hasNum() && toks[i] && 'cmd' in (toks[i] as Token) === false) break;
  }
  return segs;
}

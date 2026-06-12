/**
 * Multi-range token highlight: sub-line ranges over a Text node's wordBoxes,
 * each with its OWN animatable fill/opacity/progress/scale — four-color
 * category passes, per-token flips, karaoke-with-color. Design answers from
 * downstream production (the NNDL verification ritual):
 *  - ranges VALIDATE at construction and THROW on copy drift at draw — the
 *    throw is load-bearing (it catches edited copy that no longer matches);
 *    `rematch: true` opts animated text into per-frame re-resolution.
 *  - a range spanning a wrap produces one rect per line segment.
 *  - string matches are whitespace-stripped consecutive box runs and must end
 *    boundary-exact (mid-segment end = error listing the actual segments);
 *    `[wordIndex, wordIndex]` ranges sidestep matching entirely.
 */

import { signal, vec2Signal, type BindableSignal, type Vec2, type Vec2Signal } from '@glissade/core';
import { type DisplayListBuilder } from './displayList.js';
import { Node, type EvalContext, type NodeProps, type PropInit } from './node.js';
import { roundedRectSegs, Text, type WordBox } from './nodes.js';
import { IDENTITY, matEquals } from './matrix.js';

export interface TokenRange {
  /** token text (whitespace-insensitive run match) or inclusive [from, to] wordBoxes indices */
  match: string | readonly [number, number];
  /** which occurrence of a string match; default 1 (the first) */
  occurrence?: number;
  /** range id for track targets ('<nodeId>/<rangeId>/fill' …); default 'r<index>' */
  id?: string;
  fill?: PropInit<string>;
  opacity?: PropInit<number>;
  /** 0→1 left-to-right reveal across the range; default 1 */
  progress?: PropInit<number>;
  /** scale about the range rect's center; default 1 */
  scale?: PropInit<number>;
  /** translation of the range's rects, px — shakes and nudges; default [0, 0] */
  offset?: PropInit<Vec2>;
}

export interface TokenHighlightProps extends NodeProps {
  /** the Text whose tokens get highlighted; place this node as an EARLIER sibling */
  text: Text;
  ranges: TokenRange[];
  /** marker overhang beyond the ink box, [x, y] px; default [4, 2] */
  padding?: [number, number];
  cornerRadius?: number;
  /** re-resolve string matches every frame (animated text); default false — drift throws */
  rematch?: boolean;
}

export class TokenMatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenMatchError';
  }
}

const stripWs = (s: string): string => s.replace(/\s+/g, '');

/**
 * Find the Nth whitespace-stripped consecutive run of boxes equal to token.
 * Boundary-exact: a run that diverges mid-segment is not a match; ending
 * mid-segment throws (with the real segment list) rather than half-boxing.
 */
export function matchTokenRun(boxes: WordBox[], token: string, occurrence = 1): [number, number] {
  const want = stripWs(token);
  if (want.length === 0) throw new TokenMatchError('empty token');
  let seen = 0;
  for (let i = 0; i < boxes.length; i++) {
    let acc = '';
    for (let j = i; j < boxes.length; j++) {
      acc += stripWs(boxes[j]!.text);
      if (acc === want) {
        seen++;
        if (seen === occurrence) return [i, j];
        break; // count it, keep scanning from the next start
      }
      if (!want.startsWith(acc)) break; // diverged — try the next start
      // acc is a strict prefix: keep extending
    }
  }
  throw new TokenMatchError(
    `no match for token '${token}'${occurrence > 1 ? ` (occurrence ${occurrence})` : ''} — ` +
      `segments are [${boxes.map((b) => `'${b.text}'`).join(', ')}]`,
  );
}

interface ResolvedRange {
  spec: TokenRange;
  fill: BindableSignal<string>;
  opacity: BindableSignal<number>;
  progress: BindableSignal<number>;
  scale: BindableSignal<number>;
  offset: Vec2Signal;
  /** inclusive box index range, bound at construction unless rematch */
  run: [number, number];
  /** the stripped token at bind time — the drift check compares against this */
  bound: string;
}

export class TokenHighlight extends Node {
  readonly target: Text;
  readonly padding: [number, number];
  readonly cornerRadius: number;
  readonly rematch: boolean;
  private readonly ranges: ResolvedRange[];

  constructor(props: TokenHighlightProps) {
    super(props);
    this.target = props.text;
    this.padding = props.padding ?? [4, 2];
    this.cornerRadius = props.cornerRadius ?? 4;
    this.rematch = props.rematch ?? false;

    // validate every range at construction — copy drift fails the build, not
    // the render farm three hours in
    const boxes = this.target.wordBoxes();
    this.ranges = props.ranges.map((spec, index) => {
      const run = this.resolveRun(boxes, spec);
      const id = spec.id ?? `r${index}`;
      const r: ResolvedRange = {
        spec,
        fill: init(signal('#ffe066'), spec.fill),
        opacity: init(signal(1), spec.opacity),
        progress: init(signal(1), spec.progress),
        scale: init(signal(1), spec.scale),
        offset: initVec(vec2Signal([0, 0]), spec.offset),
        run,
        bound: runText(boxes, run),
      };
      this.registerTarget(`${id}/fill`, r.fill);
      this.registerTarget(`${id}/opacity`, r.opacity);
      this.registerTarget(`${id}/progress`, r.progress);
      this.registerTarget(`${id}/scale`, r.scale);
      this.registerTarget(`${id}/offset`, r.offset);
      this.registerTarget(`${id}/offset.x`, r.offset.x);
      this.registerTarget(`${id}/offset.y`, r.offset.y);
      return r;
    });
  }

  private resolveRun(boxes: WordBox[], spec: TokenRange): [number, number] {
    if (typeof spec.match !== 'string') {
      const [from, to] = spec.match;
      if (from < 0 || to >= boxes.length || from > to) {
        throw new TokenMatchError(
          `word index range [${from}, ${to}] out of bounds (${boxes.length} boxes)`,
        );
      }
      return [from, to];
    }
    return matchTokenRun(boxes, spec.match, spec.occurrence ?? 1);
  }

  protected draw(out: DisplayListBuilder, ctx: EvalContext): void {
    const boxes = this.target.wordBoxes(ctx.measurer);
    if (boxes.length === 0) return;
    const tm = this.target.localMatrix();
    const [px, py] = this.padding;

    let pushedTransform = false;
    for (const r of this.ranges) {
      const opacity = r.opacity();
      if (opacity <= 0) continue;
      const progress = Math.min(1, Math.max(0, r.progress()));
      if (progress <= 0) continue;

      let run = r.run;
      if (this.rematch && typeof r.spec.match === 'string') {
        run = matchTokenRun(boxes, r.spec.match, r.spec.occurrence ?? 1);
      } else if (runText(boxes, run) !== r.bound) {
        // the copy changed under a bound range — fail loudly (downstream's
        // load-bearing throw), unless rematch opted into re-resolution
        throw new TokenMatchError(
          `bound token '${r.bound}' no longer matches boxes [${run[0]}, ${run[1]}] — ` +
            `the text changed (segments now [${boxes.slice(run[0], run[1] + 1).map((b) => `'${b.text}'`).join(', ')}]); ` +
            'pass rematch: true for animated text',
        );
      }

      // one rect per line segment of the run (a wrap never produces one tall union)
      const lineRects: { x: number; y: number; w: number; h: number }[] = [];
      for (let i = run[0]; i <= run[1]; i++) {
        const b = boxes[i]!;
        const last = lineRects[lineRects.length - 1];
        const cur = i > run[0] && boxes[i - 1]!.line === b.line ? last : undefined;
        if (cur) {
          cur.w = b.x + b.w + px - cur.x;
          cur.y = Math.min(cur.y, b.y - py);
          cur.h = Math.max(cur.h, b.y + b.h + py - cur.y);
        } else {
          lineRects.push({ x: b.x - px, y: b.y - py, w: b.w + 2 * px, h: b.h + 2 * py });
        }
      }

      if (!pushedTransform && !matEquals(tm, IDENTITY)) {
        out.push({ op: 'transform', m: tm });
        pushedTransform = true;
      }
      const grouped = opacity < 1;
      if (grouped) out.push({ op: 'pushGroup', opacity, blend: 'source-over', filters: [] });

      const fill = r.fill();
      const scale = r.scale();
      const [ox, oy] = r.offset();
      const total = lineRects.reduce((sum, q) => sum + q.w, 0);
      let remaining = progress * total;
      for (const q of lineRects) {
        const fillW = Math.min(q.w, remaining);
        remaining -= fillW;
        if (fillW <= 0) break;
        // scale about the rect center; offset translates the result
        const cx = q.x + q.w / 2 + ox;
        const cy = q.y + q.h / 2 + oy;
        const w = fillW * scale;
        const h = q.h * scale;
        const x = cx - (q.w / 2) * scale;
        const y = cy - h / 2;
        const rad = Math.min(this.cornerRadius, w / 2, h / 2);
        const path = out.resource({ kind: 'path', segs: roundedRectSegs(x, y, w, h, rad) });
        out.push({ op: 'fillPath', path, paint: { kind: 'color', color: fill } });
        if (remaining <= 0) break;
      }
      if (grouped) out.push({ op: 'popGroup' });
    }
  }
}

function runText(boxes: WordBox[], run: [number, number]): string {
  return boxes
    .slice(run[0], run[1] + 1)
    .map((b) => stripWs(b.text))
    .join('');
}

/**
 * `children: [tokenHighlight(para, { ranges: [{ match: '$48,200', fill: cat.money }] }), para]`
 * — each range animates independently via '<id>/<rangeId>/fill|opacity|progress|scale'.
 */
export function tokenHighlight(text: Text, props: Omit<TokenHighlightProps, 'text'>): TokenHighlight {
  return new TokenHighlight({ ...props, text });
}

function init<T>(sig: BindableSignal<T>, v: PropInit<T> | undefined): BindableSignal<T> {
  if (typeof v === 'function') sig.bindSource(v as () => T);
  else if (v !== undefined) sig.set(v);
  return sig;
}

function initVec(sig: Vec2Signal, v: PropInit<Vec2> | undefined): Vec2Signal {
  if (typeof v === 'function') sig.bindSource(v);
  else if (v !== undefined) sig.set(v);
  return sig;
}

/**
 * Filtered-composite clipping (the software-rendering fix): ctx.filter costs
 * scale with the DESTINATION area, so popGroup clips the composite to the
 * layer's painted bounds + filter reach. These tests pin the decision logic
 * with a recording host; the golden suite proves the clip is pixel-invisible.
 */

import { describe, expect, it } from 'vitest';
import { Raster2D, type Ctx2DLike, type PathLike } from '../src/raster2d.js';
import type { DisplayList, DrawCommand, Resource } from '../src/displayList.js';

interface RecPath extends PathLike {
  pts: [string, ...number[]][];
}

function makeHost() {
  const ops: string[] = [];
  const clips: { pts: [string, ...number[]][] }[] = [];
  let composites = 0;
  const makeCtx = (): Ctx2DLike<RecPath, unknown> => {
    const ctx = {
      save: () => ops.push('save'),
      restore: () => ops.push('restore'),
      transform: () => ops.push('transform'),
      resetTransform: () => {},
      getTransform: () => ({}),
      setTransform: () => {},
      clearRect: () => {},
      clip: (p: RecPath) => {
        ops.push('clip');
        clips.push({ pts: p.pts });
      },
      fill: () => ops.push('fill'),
      stroke: () => ops.push('stroke'),
      fillText: () => ops.push('fillText'),
      drawImage: () => {
        ops.push('drawImage');
        composites++;
      },
      setLineDash: () => {},
      lineDashOffset: 0,
      measureText: (t: string) => ({ width: t.length * 10 }),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
      font: '',
      textBaseline: '',
      textAlign: '',
      globalAlpha: 1,
      globalCompositeOperation: '',
      filter: '',
      imageSmoothingEnabled: true,
    };
    return ctx as unknown as Ctx2DLike<RecPath, unknown>;
  };
  const host = {
    context: () => makeCtx(),
    createCanvas: (w: number, h: number) => ({ width: w, height: h }),
    newPath: (): RecPath => {
      const pts: [string, ...number[]][] = [];
      return {
        pts,
        moveTo: (x, y) => pts.push(['M', x, y]),
        lineTo: (x, y) => pts.push(['L', x, y]),
        bezierCurveTo: () => {},
        quadraticCurveTo: () => {},
        ellipse: () => {},
        closePath: () => pts.push(['Z']),
      };
    },
  };
  return {
    host,
    ops,
    clips,
    composites: () => composites,
  };
}

const rect = (x: number, y: number, w: number, h: number): Resource => ({
  kind: 'path',
  segs: [
    ['M', x, y],
    ['L', x + w, y],
    ['L', x + w, y + h],
    ['L', x, y + h],
    ['Z'],
  ],
});

const GLOW: DrawCommand = {
  op: 'pushGroup',
  opacity: 1,
  blend: 'source-over',
  filters: [
    { kind: 'drop-shadow', dx: 0, dy: 0, blur: 8, color: '#fff' },
    { kind: 'drop-shadow', dx: 0, dy: 0, blur: 20, color: '#fff' },
  ],
};

function list(commands: DrawCommand[], resources: Resource[] = []): DisplayList {
  return { commands, resources, size: { w: 640, h: 360 } };
}

function render(dl: DisplayList) {
  const h = makeHost();
  const raster = new Raster2D(h.host as never);
  raster.render({ width: 640, height: 360 }, dl as never);
  return h;
}

describe('filtered composites clip to painted bounds + filter reach', () => {
  it('a glow group around a small rect clips, with the summed shadow outset', () => {
    const h = render(
      list(
        [GLOW, { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#fff' } }, { op: 'popGroup' }],
        [rect(100, 100, 50, 50)],
      ),
    );
    expect(h.clips).toHaveLength(1);
    // outset = 3*8 + 3*20 = 84 → [100-84, 150+84], snapped outward
    expect(h.clips[0]!.pts).toEqual([
      ['M', 16, 16],
      ['L', 234, 16],
      ['L', 234, 234],
      ['L', 16, 234],
      ['Z'],
    ]);
  });

  it('an unfiltered group composites without clipping', () => {
    const h = render(
      list(
        [
          { op: 'pushGroup', opacity: 0.5, blend: 'source-over', filters: [] },
          { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#fff' } },
          { op: 'popGroup' },
        ],
        [rect(0, 0, 10, 10)],
      ),
    );
    expect(h.clips).toHaveLength(0);
    expect(h.composites()).toBe(1);
  });

  it('non-source-over blends never clip (copy/in modes touch pixels outside the content)', () => {
    const h = render(
      list(
        [
          { ...GLOW, blend: 'multiply' },
          { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#fff' } },
          { op: 'popGroup' },
        ],
        [rect(100, 100, 50, 50)],
      ),
    );
    expect(h.clips).toHaveLength(0);
    expect(h.composites()).toBe(1);
  });

  it('the transform stack maps bounds to device space', () => {
    const h = render(
      list(
        [
          { op: 'save' },
          { op: 'transform', m: [2, 0, 0, 2, 100, 0] }, // scale 2, translate x+100
          GLOW,
          { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#fff' } },
          { op: 'popGroup' },
          { op: 'restore' },
        ],
        [rect(10, 10, 20, 20)],
      ),
    );
    // local [10,30]² → device x [120,160], y [20,60]; outset 84
    expect(h.clips[0]!.pts[0]).toEqual(['M', 36, 0]); // 120-84=36; 20-84 clamps to 0
    expect(h.clips[0]!.pts[2]).toEqual(['L', 244, 144]); // 160+84, 60+84
  });

  it('stroke bounds include the miter-limit reach', () => {
    const h = render(
      list(
        [
          GLOW,
          { op: 'strokePath', path: 0, paint: { kind: 'color', color: '#fff' }, stroke: { width: 10 } },
          { op: 'popGroup' },
        ],
        [rect(200, 200, 40, 40)],
      ),
    );
    // miter outset 5×10 = 50, filter outset 84 → 200-134 = 66
    expect(h.clips[0]!.pts[0]).toEqual(['M', 66, 66]);
  });

  it('an empty filtered source-over group skips its composite entirely', () => {
    const h = render(list([GLOW, { op: 'popGroup' }]));
    expect(h.composites()).toBe(0);
  });

  it('nested groups propagate bounds (inner glow grows the outer clip)', () => {
    const h = render(
      list(
        [
          GLOW,
          {
            op: 'pushGroup',
            opacity: 1,
            blend: 'source-over',
            filters: [{ kind: 'blur', radius: 10 }],
          },
          { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#fff' } },
          { op: 'popGroup' },
          { op: 'popGroup' },
        ],
        [rect(100, 100, 50, 50)],
      ),
    );
    expect(h.clips).toHaveLength(2);
    // inner blur clip: 100 - 30 = 70
    expect(h.clips[0]!.pts[0]).toEqual(['M', 70, 70]);
    // outer glow clip: inner content + blur outset 30, then glow outset 84 → 100-114 clamps... 100-30-84 = -14 → 0
    expect(h.clips[1]!.pts[0]).toEqual(['M', 0, 0]);
    expect(h.clips[1]!.pts[2]).toEqual(['L', 264, 264]); // 150+30+84
  });

  it('text inside a filtered group stays bounded via measureText', () => {
    const h = render(
      list([
        GLOW,
        {
          op: 'fillText',
          text: 'hello',
          font: { family: 'x', size: 20 },
          paint: { kind: 'color', color: '#fff' },
          x: 300,
          y: 200,
          align: 'center',
        },
        { op: 'popGroup' },
      ]),
    );
    expect(h.clips).toHaveLength(1);
    // width 50 centered at 300 → [275, 325]; em margin 20; glow outset 84
    expect(h.clips[0]!.pts[0]).toEqual(['M', 171, 86]); // 275-20-84, 200-30-84
  });
});

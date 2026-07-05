/**
 * 0.64 CAPTION_COLLISION + `safeAreas` — the reserved caption-band diagnostic.
 *
 * Render-NEUTRAL + critique-only: a SafeArea is never a render input, so all these
 * cases read the DisplayList only. Covers (c) a non-owner intruding the band fires
 * while the OWNER + its subtree do NOT (subtree-match, no self-collision); (a) a
 * caption OWNING a band gets the band height as its effective height-box WITHOUT a
 * render `box.h` (shrink vs escalate via minLegiblePx); (b) a resize whose grow
 * would enter a NON-owned band is infeasible (escalates when fontSize is exhausted);
 * and determinism (identical diagnostics run-to-run).
 */
import { describe, expect, it } from 'vitest';
import { type Timeline } from '@glissade/core';
import { createScene, Rect, Text, Group } from '../src/index.js';
import { critique, type SafeArea } from '../src/diagnostics.js';
import { isContentOnly, isGeometryFixable } from '../src/assess.js';
import { describe as apiDescribe } from '../src/describe.js';
import { type TextMeasurer } from '../src/text.js';

const size = { w: 200, h: 100 };
const empty: Timeline = { version: 1, tracks: [] };

/** Deterministic, non-estimating measurer: width = len·size·0.6. */
const stub: TextMeasurer = {
  measureText: (t, f) => ({ width: t.length * f.size * 0.6, ascent: f.size * 0.8, descent: f.size * 0.2 }),
};

describe('critique — CAPTION_COLLISION (c): a non-owner intruding a reserved band', () => {
  const band: SafeArea = { bounds: { minX: 0, minY: 70, maxX: 200, maxY: 100 }, owner: 'cap' };

  it('FIRES for a non-owner in the band; the OWNER subtree (caption + child word nodes) does NOT', () => {
    const scene = createScene({
      size,
      children: [
        // owner GROUP + a painting child (a word-pop split child) — both in the band,
        // both subtree-matched EXEMPT (no self-collision).
        new Group({
          id: 'cap',
          position: [100, 80],
          children: [new Rect({ id: 'cap-word0', position: [0, 2], width: 40, height: 10, fill: '#fff' })],
        }),
        new Rect({ id: 'logo', position: [100, 85], width: 40, height: 20, fill: '#0f0' }), // non-owner, in band → collide
        new Rect({ id: 'header', position: [100, 20], width: 40, height: 20, fill: '#f00' }), // above band → clear
      ],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty, { safeAreas: [band] });
    const cc = res.diagnostics.filter((d) => d.code === 'CAPTION_COLLISION');
    expect(cc.map((d) => d.node)).toEqual(['logo']); // ONLY the non-owner intruder
    const d = cc[0]!;
    expect(d.severity).toBe('warning');
    expect(d.source).toBe('critique');
    expect(d.message).toContain("'cap'"); // names the band by its owner
    expect(isGeometryFixable(d)).toBe(true); // position lever, always offered (MVP)
    expect((d.detail as { fixHints: { lever: string }[] }).fixHints[0]!.lever).toBe('position');
  });

  it('the OWNER node painting directly in its OWN band does NOT self-collide', () => {
    const scene = createScene({
      size,
      children: [new Rect({ id: 'cap', position: [100, 85], width: 40, height: 20, fill: '#fff' })],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty, { safeAreas: [band] });
    expect(res.diagnostics.some((d) => d.code === 'CAPTION_COLLISION')).toBe(false);
  });

  it('emits NOTHING new without safeAreas (opt-in; byte-identical to prior behaviour)', () => {
    const scene = createScene({
      size,
      children: [new Rect({ id: 'logo', position: [100, 85], width: 40, height: 20, fill: '#0f0' })],
    });
    scene.setTextMeasurer(stub);
    expect(critique(scene, empty).diagnostics.some((d) => d.code === 'CAPTION_COLLISION')).toBe(false);
  });
});

describe('critique — (a) a caption owning a band uses its height as the effective height-box', () => {
  // band height 60 (40..100); a 4-line block at fontSize 20 is quantize(25)·4 = 100 tall → overflows 60.
  const band: SafeArea = { bounds: { minX: 0, minY: 40, maxX: 200, maxY: 100 }, owner: 'cap' };
  const captionScene = (): ReturnType<typeof createScene> => {
    const scene = createScene({
      size,
      children: [
        new Text({ id: 'cap', position: [100, 50], text: 'L1\nL2\nL3\nL4', fontSize: 20, lineHeight: 1.25, fill: '#000' }),
      ],
    });
    scene.setTextMeasurer(stub);
    return scene;
  };

  it('FIRES a HEIGHT overflow vs the OWNED band height — WITHOUT setting a render box.h', () => {
    const scene = captionScene();
    const res = critique(scene, empty, { safeAreas: [band] });
    const d = res.diagnostics.find(
      (x) => x.code === 'TEXT_OVERFLOW' && (x.detail as { dimension?: string }).dimension === 'height',
    );
    expect(d, 'the caption should overflow its owned band height').toBeDefined();
    expect(d!.detail).toMatchObject({ dimension: 'height', threshold: 60 }); // 60 = band height, the effective box
    // render-neutrality: no render box.h was set on the node (critique-only effective box).
    expect((scene.nodes.get('cap') as Text).box).toBeUndefined();
    // and WITHOUT safeAreas the auto-height caption (no box.h) can't overflow one — no fire.
    expect(critique(captionScene(), empty).diagnostics.some((x) => x.code === 'TEXT_OVERFLOW')).toBe(false);
  });

  it('shrink-to-fit when the fontSize lands ≥ minLegiblePx (geometry-fixable)', () => {
    const res = critique(captionScene(), empty, { safeAreas: [band] });
    const d = res.diagnostics.find(
      (x) => x.code === 'TEXT_OVERFLOW' && (x.detail as { dimension?: string }).dimension === 'height',
    )!;
    expect(isGeometryFixable(d)).toBe(true); // fitFontPx = 20·(60/100) = 12 ≥ 6 → fontSize lever offered
  });

  it('ESCALATES (content-only) when the shrink would sink below minLegiblePx (band is fixed → no resize)', () => {
    const res = critique(captionScene(), empty, { safeAreas: [band], minLegiblePx: 15 });
    const d = res.diagnostics.find(
      (x) => x.code === 'TEXT_OVERFLOW' && (x.detail as { dimension?: string }).dimension === 'height',
    )!;
    // fitFontPx 12 < 15 → fontSize infeasible; the owned band is a FIXED region → resize dropped;
    // only the content 'text' lever remains → the loop must ESCALATE (never auto-shrink to unreadable).
    expect(isGeometryFixable(d)).toBe(false);
    expect(isContentOnly(d)).toBe(true);
  });
});

describe('critique — (b) resize feasibility reads the SafeAreas', () => {
  const big = { w: 400, h: 400 };
  // A tall, box.h-constrained title that overflows HEIGHT; growing box.h enough would
  // push into the reserved band below it.
  const titleScene = (): ReturnType<typeof createScene> => {
    const scene = createScene({
      size: big,
      children: [
        new Text({
          id: 'title',
          position: [200, 180],
          text: 'AA\nBB\nCC\nDD',
          fontSize: 20,
          lineHeight: 1.5,
          fill: '#000',
          box: { valign: 'top', h: 20 },
        }),
      ],
    });
    scene.setTextMeasurer(stub);
    return scene;
  };
  const heightDiag = (opts: Parameters<typeof critique>[2]) => {
    const res = critique(titleScene(), empty, opts);
    return res.diagnostics.find(
      (x) => x.code === 'TEXT_OVERFLOW' && (x.detail as { dimension?: string }).dimension === 'height',
    )!;
  };

  it('WITHOUT a band the resize (box.h grow) lever is feasible (canvas-bounded only) → geometry-fixable', () => {
    const d = heightDiag({});
    expect(d, 'height overflow fires').toBeDefined();
    // fontSize shrink is infeasible here (fitFontPx ≈ 3.3 < 6), so the ONLY geometry lever is the resize.
    expect(isGeometryFixable(d)).toBe(true);
    expect((d.detail as { fixHints: { lever: string }[] }).fixHints.some((h) => h.lever === 'box.h')).toBe(true);
  });

  it('a grow that would intrude a NON-owned band drops the resize lever → escalates (content-only)', () => {
    const nonOwned: SafeArea = { bounds: { minX: 0, minY: 200, maxX: 400, maxY: 400 }, owner: 'someone-else' };
    const d = heightDiag({ safeAreas: [nonOwned] });
    expect(isGeometryFixable(d)).toBe(false); // resize into the band is infeasible; fontSize already exhausted
    expect(isContentOnly(d)).toBe(true);
  });
});

describe('critique — determinism: same scene + safeAreas ⇒ identical diagnostics', () => {
  it('is byte-stable run-to-run (integer-region intersection, canonical sort)', () => {
    const band: SafeArea = { bounds: { minX: 0, minY: 70, maxX: 200, maxY: 100 }, owner: 'cap' };
    const build = (): ReturnType<typeof createScene> => {
      const scene = createScene({
        size,
        children: [
          new Rect({ id: 'logo', position: [100, 85], width: 40, height: 20, fill: '#0f0' }),
          new Rect({ id: 'badge', position: [30, 80], width: 20, height: 20, fill: '#00f' }),
        ],
      });
      scene.setTextMeasurer(stub);
      return scene;
    };
    const a = critique(build(), empty, { safeAreas: [band] });
    const b = critique(build(), empty, { safeAreas: [band] });
    expect(a.diagnostics).toEqual(b.diagnostics);
    // two intruders, both reported, canonically ordered by node id
    expect(a.diagnostics.filter((d) => d.code === 'CAPTION_COLLISION').map((d) => d.node)).toEqual(['badge', 'logo']);
  });
});

describe('describe() — SafeArea discoverability (types registry + options schema)', () => {
  it('exposes the Region + SafeArea structured types so a no-build agent can BUILD one', () => {
    const m = apiDescribe();
    expect(m.types?.Region).toEqual({ minX: 'number', minY: 'number', maxX: 'number', maxY: 'number', space: 'px' });
    expect(m.types?.SafeArea).toEqual({ bounds: 'Region', owner: 'string?' });
  });

  it('lists safeAreas in the assess + critique options schemas', () => {
    const m = apiDescribe();
    for (const name of ['assess', 'critique']) {
      const entry = (m.surface ?? []).find((e) => e.name === name);
      const opt = entry?.options?.find((o) => o.name === 'safeAreas');
      expect(opt, `${name} options should list safeAreas`).toBeDefined();
      expect(opt!.type).toBe('SafeArea[]');
    }
  });
});

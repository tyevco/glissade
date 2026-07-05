/**
 * gs parity --semantic — the structured Skia↔Lottie round-trip drop-diff.
 *
 * Pins: the empty-set gate (a CLEAN round-trip → EMPTY default error-only view);
 * a warn-explained drop (an Image the exporter drops) → a LOTTIE_DROP finding
 * tagged expected:true + severity:info (masked from the default view, shown by
 * --all); the 3 correlation invariants hold; parseWarn's node/property/approximate
 * extraction; and the DETERMINISTIC total-order attribution (topmost paint wins,
 * node-id tiebreak, order-independent of the bounds-map iteration = shuffle-stable).
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';
import type { SsimMap } from '@glissade/backend-skia';
import { semanticParityCommand, parseWarn, attributeResiduals } from '../src/semanticParity.js';
import fixtureModule from './fixtures/parity-scene.js';
import imageModule from './fixtures/parity-image.js';
// Real corpus scenes through vitest's graph (instanceof-safe for the exporter's
// node-kind checks — like the parity.test.ts pattern). Each exercises a render-only
// DROP whose residual lands on a node the warn doesn't name directly:
//   camera — whole-frame shake, residual on the rig's CONTENT subtree.
//   echo   — echo wraps its child; FollowPath drives a target.
//   orient — followPath/orientToPath/lookAt DRIVERS whose (SIBLING) targets diverge.
//   motionblur — the wrapped child is absorbed; an INDEPENDENT sibling stays loud.
import cameraModule from '../../examples/src/scenes/golden-camera.js';
import echoModule from '../../examples/src/scenes/golden-echo.js';
import orientModule from '../../examples/src/scenes/golden-orient.js';
import motionblurModule from '../../examples/src/scenes/golden-motionblur.js';

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));
const EXAMPLES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const CLEAN = { modulePath: join(FIXTURES, 'parity-scene.ts'), module: fixtureModule } as const;
const IMAGE = { modulePath: join(FIXTURES, 'parity-image.ts'), module: imageModule } as const;

// Fonts set up the way `gs render` / the golden harness do — register the committed
// DejaVu Sans so a text scene renders with real (not estimated) metrics on ALL legs.
GlobalFonts.registerFromPath(fileURLToPath(new URL('../../examples/assets/fonts/DejaVuSans.ttf', import.meta.url)), 'DejaVu Sans');

describe('gs parity --semantic — empty-set on a clean round-trip (the HARD gate)', () => {
  it('a faithful shape scene has an EMPTY default error-only view + all invariants hold', async () => {
    const r = await semanticParityCommand({ ...CLEAN, frames: [0, 30, 60, 90, 119], min: 0.98 });
    expect(r.view).toEqual([]); // default = error-only; a clean round-trip surfaces nothing
    expect(r.hasErrors).toBe(false);
    expect(r.invariants).toEqual({ regionOverlapsResidual: true, everyResidualHasCause: true, everyWarnHasFinding: true });
  });

  it('is deterministic — two runs are byte-identical (findings + view)', async () => {
    const a = await semanticParityCommand({ ...CLEAN, frames: [0, 30, 60], min: 0.98 });
    const b = await semanticParityCommand({ ...CLEAN, frames: [0, 30, 60], min: 0.98 });
    expect(JSON.stringify(a.findings)).toBe(JSON.stringify(b.findings));
  });
});

describe('gs parity --semantic — a warn-explained drop is fused + masked', () => {
  it('an Image drop → a LOTTIE_DROP tagged expected:true, masked from the default view', async () => {
    const r = await semanticParityCommand({ ...IMAGE, frames: [0], min: 0.98, all: true });
    const drop = r.findings.find((f) => f.code === 'LOTTIE_DROP' && f.node === 'swatch');
    expect(drop, 'a LOTTIE_DROP for the dropped image').toBeTruthy();
    expect(drop!.severity).toBe('info'); // expected:true drop → info → masked from default
    expect(drop!.detail?.expected).toBe(true);
    expect(drop!.detail?.property).toBe('image');
    expect(drop!.detail?.cause).toMatch(/not exportable/);
    expect(drop!.detail?.region).toBeTruthy(); // localized to the swatch's rendered bbox
    // fusion is real: every captured warn has a finding.
    expect(r.invariants.everyWarnHasFinding).toBe(true);
    // default (error-only) view masks the expected drop → no error, empty view.
    const def = await semanticParityCommand({ ...IMAGE, frames: [0], min: 0.98 });
    expect(def.view.every((f) => f.severity === 'error')).toBe(true);
  });
});

describe('gs parity --semantic — a WARNED drop must NOT false-fire UNEXPLAINED (the baseline-regression invariant)', () => {
  // The pre.1 regression guard: a documented, warn-explained render-only drop whose
  // residual lands on a node the warn doesn't name directly (a wrapper's SUBTREE, a
  // driver's SIBLING target) must STRUCTURALLY coalesce to that ONE expected drop —
  // NOT spam N spurious UNEXPLAINED_RESIDUAL leaves. Default error-only view = EMPTY.
  const cases = [
    { name: 'golden-camera', module: cameraModule },
    { name: 'golden-echo', module: echoModule },
    { name: 'golden-orient', module: orientModule },
  ] as const;

  for (const c of cases) {
    it(`${c.name}: ZERO spurious UNEXPLAINED — the warned drops surface as EXPECTED, masked`, async () => {
      const opts = { modulePath: join(EXAMPLES, `${c.name}.ts`), module: c.module, frames: [0, 30, 60], min: 0.98 };
      const r = await semanticParityCommand({ ...opts, all: true });
      expect(r.findings.filter((f) => f.code === 'UNEXPLAINED_RESIDUAL')).toEqual([]);
      expect(r.hasErrors).toBe(false);
      // every finding is a warn-EXPECTED drop (or an approximation), all masked:
      expect(r.findings.every((f) => f.detail?.expected === true)).toBe(true);
      expect(r.invariants.everyWarnHasFinding).toBe(true);
      // default (error-only) view is EMPTY.
      const def = await semanticParityCommand(opts);
      expect(def.view).toEqual([]);
    });
  }

  it('the coalesced finding RECORDS its absorbed descendants (masked, but never silent)', async () => {
    const r = await semanticParityCommand({ modulePath: join(EXAMPLES, 'golden-camera.ts'), module: cameraModule, frames: [0, 30], min: 0.98, all: true });
    const camDrop = r.findings.find((f) => f.node === 'cam');
    expect(camDrop?.code).toBe('LOTTIE_DROP');
    expect((camDrop?.detail?.coalesced as string[] | undefined)?.length).toBeGreaterThan(0);
  });
});

describe('gs parity --semantic — Direction-2: an INDEPENDENT residual inside a drop stays UNEXPLAINED (no silent false-negative)', () => {
  // golden-motionblur: motionBlur('mb') wraps 'fast' (its SUBTREE) + a separate,
  // INDEPENDENT 'crisp' reference dot rides the same rail. The wrapped 'fast' is
  // absorbed into the 'mb' drop (structural), but 'crisp' — NOT in mb's subtree,
  // merely overlapping the smear geometrically — must STAY UNEXPLAINED. This proves
  // absorption is STRUCTURAL, not naive geometric containment (over-absorbing a real
  // drop into a nearby wrapper would be a silent false-negative, worse than noise).
  it('absorbs the wrapped child but keeps the independent sibling loud', async () => {
    const r = await semanticParityCommand({ modulePath: join(EXAMPLES, 'golden-motionblur.ts'), module: motionblurModule, frames: [0, 30, 60], min: 0.98, all: true });
    const mbDrop = r.findings.find((f) => f.node === 'mb');
    expect(mbDrop?.code).toBe('LOTTIE_DROP'); // the motionBlur drop
    expect(mbDrop?.detail?.coalesced as string[]).toContain('fast'); // wrapped child absorbed
    // the INDEPENDENT sibling is NOT swept into the wrapper's expected drop:
    const crisp = r.findings.find((f) => f.node === 'crisp');
    expect(crisp?.code).toBe('UNEXPLAINED_RESIDUAL');
    expect(crisp?.detail?.expected).toBe(false);
  });
});

describe('parseWarn — node / property / approximate extraction', () => {
  it('parses a hard drop naming a node', () => {
    expect(parseWarn("Image 'swatch' is not exportable (MVP: Group / Rect / Circle / Path / Text) — dropped")).toMatchObject({
      node: 'swatch',
      property: 'image',
      approximate: false,
    });
  });
  it('parses a render-only motionBlur drop', () => {
    expect(parseWarn("MotionBlur 'title': motionBlur (analog-shutter smear) is render-only — NOT exported to Lottie")).toMatchObject({
      node: 'title',
      property: 'motion-blur',
      approximate: false,
    });
  });
  it('parses an APPROXIMATE degrade (box valign)', () => {
    expect(parseWarn("Text 'cap': box valign is approximated as baseline-anchored (no Lottie ink-box anchor) — vertical placement may shift")).toMatchObject({
      node: 'cap',
      property: 'box-valign',
      approximate: true,
    });
  });
  it('parses a variable-font-axes drop', () => {
    expect(parseWarn("Text 'h': variable-font axes (fontAxes/fontVariationSettings) have no Lottie text-document field — dropped").property).toBe('variable-font-axes');
  });
});

describe('attributeResiduals — the DETERMINISTIC total-order rule', () => {
  // a 4×4 tile grid (32×32 px, win 8). A single residual tile at grid (1,1) whose
  // center (12,12) is contained by BOTH nodes — the topmost (higher paint order) wins.
  function grid(residualAt: [number, number]): SsimMap {
    const cols = 4, rows = 4;
    const tiles = new Float64Array(cols * rows).fill(1);
    tiles[residualAt[1] * cols + residualAt[0]] = 0.2;
    return { mean: 0.95, min: 0.2, minTile: { tx: residualAt[0], ty: residualAt[1] }, cols, rows, win: 8, tiles };
  }
  const boxAll = { minX: 0, minY: 0, maxX: 32, maxY: 32 };

  it('a contained tile is attributed to the TOPMOST node (highest paint order)', () => {
    const bounds = new Map([
      ['under', { bounds: boxAll, order: 1 }],
      ['over', { bounds: boxAll, order: 9 }],
    ]);
    const { perNode } = attributeResiduals(grid([1, 1]), bounds, 0.98);
    expect([...perNode.keys()]).toEqual(['over']);
  });

  it('is order-independent of the bounds-map iteration (shuffle-stable)', () => {
    const forward = new Map([
      ['a', { bounds: boxAll, order: 5 }],
      ['b', { bounds: boxAll, order: 5 }], // equal order → node-id tiebreak → 'a' wins
    ]);
    const reversed = new Map([
      ['b', { bounds: boxAll, order: 5 }],
      ['a', { bounds: boxAll, order: 5 }],
    ]);
    const r1 = attributeResiduals(grid([1, 1]), forward, 0.98);
    const r2 = attributeResiduals(grid([1, 1]), reversed, 0.98);
    expect([...r1.perNode.keys()]).toEqual(['a']); // lexicographic tiebreak
    expect([...r2.perNode.keys()]).toEqual(['a']); // identical regardless of Map order
  });

  it('a residual in blank space beyond the radius becomes an ORPHAN', () => {
    // 16×16 grid (128×128 px). A tiny corner node + a residual tile at the far
    // corner (center 124,124), ~169px away → beyond ORPHAN_RADIUS (64) → orphan.
    const cols = 16, rows = 16;
    const tiles = new Float64Array(cols * rows).fill(1);
    tiles[15 * cols + 15] = 0.2;
    const bigGrid: SsimMap = { mean: 0.99, min: 0.2, minTile: { tx: 15, ty: 15 }, cols, rows, win: 8, tiles };
    const far = new Map([['x', { bounds: { minX: 0, minY: 0, maxX: 4, maxY: 4 }, order: 1 }]]);
    const { perNode, orphan } = attributeResiduals(bigGrid, far, 0.98);
    expect(perNode.size).toBe(0);
    expect(orphan).toBeTruthy();
  });
});

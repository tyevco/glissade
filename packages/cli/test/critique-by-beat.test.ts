/**
 * gs critique --by-beat — beat-attributed diagnostics. Gates the attribution
 * spine: node-entrance-keyframe → committed narration.timing.json window
 * (half-open, boundary → NEXT), the 4-BUCKET honest split (byBeat ∪ spans ∪
 * unattributed ∪ static, each diagnostic in exactly one, NONE silently in seg-0):
 * full-duration-span → `[likely FRAME-owned]`; keyframeless → `[no entrance
 * keyframe]`; node-less → static. Plus the escalate-boundary presentation
 * (geometry → suggested / content → author-decision), DETERMINISM (byte-identical
 * run-to-run), and NON-MUTATION.
 *
 * The pure attribution/formatting is tested directly against src. The end-to-end
 * runs go through the BUILT cli binary (a real child process): the command loads
 * scene modules via jiti, which under vitest's src aliases resolves a SECOND
 * `@glissade/scene` instance, so `node instanceof Text` (how critique detects a
 * Text overflow) is false. The production CLI has a single module graph — we
 * exercise that real path here (the same pattern as fonts.test.ts).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { NarrationTiming } from '@glissade/narrate';
import type { SceneDiagnostic } from '@glissade/scene/diagnostics';
import {
  attributeNode,
  buildByBeatReport,
  critiqueCommand,
  formatByBeatReport,
  nodeEntranceTimes,
  resolveOwningNodeId,
  SPANS_LABEL,
  UNATTRIBUTED_LABEL,
  type ByBeatReport,
} from '../src/critique.js';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const SCENE = fileURLToPath(new URL('./fixtures/critique-by-beat/scene.ts', import.meta.url));
const TIMING = fileURLToPath(new URL('./fixtures/critique-by-beat/narration.timing.json', import.meta.url));

// contiguous windows so the half-open boundary is unambiguous:
//   seg-a [0, 1.5)  seg-b [1.5, 3.0)  seg-c [3.0, 5.0)
const timing: NarrationTiming = JSON.parse(readFileSync(TIMING, 'utf8'));

const diag = (node: string | undefined, code = 'TEXT_OVERFLOW'): SceneDiagnostic => ({
  schemaVersion: 1,
  code: code as SceneDiagnostic['code'],
  severity: 'warning',
  source: 'critique',
  message: `synthetic ${code} on ${node ?? '(none)'}`,
  ...(node !== undefined ? { node } : {}),
});

const runCli = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

// ── pure attribution ──────────────────────────────────────────────────────────

describe('attributeNode — entrance → half-open beat window', () => {
  it('1. a node entering during seg-X (entrance in [startX, endX)) attributes to seg-X', () => {
    // entrance 2.0 ∈ [1.5, 3.0) = seg-b
    expect(attributeNode({ min: 2.0, max: 3.5 }, timing)).toEqual({ kind: 'seg', segId: 'seg-b' });
    // entrance 0.5 ∈ [0, 1.5) = seg-a
    expect(attributeNode({ min: 0.5, max: 0.9 }, timing)).toEqual({ kind: 'seg', segId: 'seg-a' });
    // entrance 3.0 ∈ [3.0, 5.0) = seg-c
    expect(attributeNode({ min: 3.0, max: 4.0 }, timing)).toEqual({ kind: 'seg', segId: 'seg-c' });
  });

  it('2. HALF-OPEN boundary: entrance == a segment end attributes to the NEXT segment (not the previous, not both)', () => {
    // 1.5 == seg-a.end == seg-b.start → seg-b, NEVER seg-a
    const owner = attributeNode({ min: 1.5, max: 2.0 }, timing);
    expect(owner).toEqual({ kind: 'seg', segId: 'seg-b' });
    expect(owner).not.toEqual({ kind: 'seg', segId: 'seg-a' });
    // 3.0 == seg-b.end == seg-c.start → seg-c
    expect(attributeNode({ min: 3.0, max: 3.1 }, timing)).toEqual({ kind: 'seg', segId: 'seg-c' });
  });

  it('3. keyframeless node → the honest [no entrance keyframe] unattributed marker (NOT spans, NOT seg-0)', () => {
    // no entrance to time-attribute → unattributed, NOT the frame-owned spans claim.
    expect(attributeNode(undefined, timing)).toEqual({ kind: 'unattributed' });
    expect(attributeNode({ min: undefined, max: undefined }, timing)).toEqual({ kind: 'unattributed' });
    // explicitly NOT spans and NOT the first segment
    expect(attributeNode(undefined, timing)).not.toEqual({ kind: 'spans' });
    expect(attributeNode(undefined, timing)).not.toEqual({ kind: 'seg', segId: 'seg-a' });
  });

  it('4. full-duration span (min ≤ first start, max ≥ last end) → the spans marker (NOT unattributed, NOT seg-0)', () => {
    // min 0 ≤ 0 (firstStart) AND max 5 ≥ 5 (lastEnd) → genuine frame-owned span
    expect(attributeNode({ min: 0, max: 5 }, timing)).toEqual({ kind: 'spans' });
    expect(attributeNode({ min: 0, max: 5 }, timing)).not.toEqual({ kind: 'unattributed' });
    expect(attributeNode({ min: 0, max: 5 }, timing)).not.toEqual({ kind: 'seg', segId: 'seg-a' });
    // a node entering at 0 but NOT spanning to the end is a legitimate seg-a (not spans)
    expect(attributeNode({ min: 0, max: 0.4 }, timing)).toEqual({ kind: 'seg', segId: 'seg-a' });
  });
});

// ── the composed report (synthetic diagnostics through a scene-graph stand-in) ──

describe('buildByBeatReport — grouping, order, totality', () => {
  const nodeIds = new Set(['aa', 'bb', 'cc', 'zz', 'back', 'orphan']);
  const scene = { nodes: new Map([...nodeIds].map((id) => [id, {}])) } as unknown as Parameters<
    typeof buildByBeatReport
  >[1];
  const tracks = [
    { target: 'aa/opacity', type: 'number', keys: [{ t: 2.0, value: 1 }] }, // → seg-b
    { target: 'bb/position.x', type: 'number', keys: [{ t: 2.2, value: 0 }] }, // → seg-b
    { target: 'cc/opacity', type: 'number', keys: [{ t: 0.5, value: 1 }] }, // → seg-a
    { target: 'back/position.x', type: 'number', keys: [{ t: 0, value: 0 }, { t: 5, value: 0 }] }, // spans (full-span)
    // 'zz' has NO track → keyframeless → unattributed.
  ] as unknown as Parameters<typeof buildByBeatReport>[2];

  const result = {
    schemaVersion: 1 as const,
    hasErrors: false,
    renderedSkipped: false,
    sampledFrames: 3,
    diagnostics: [
      diag('bb'),
      diag('aa'),
      diag('cc'),
      diag('back'),
      diag('zz'),
      diag(undefined, 'ID_COLLISION'), // static (no node)
    ],
  };
  const report: ByBeatReport = buildByBeatReport(result, scene, tracks, timing);

  it('5. NEGATIVE INVARIANT: no flagged node SILENTLY attributes to seg-0 — every non-beat bucket is explicit', () => {
    const segA = report.byBeat.find((g) => g.segId === 'seg-a');
    const segANodes = new Set(segA?.diagnostics.map((d) => d.node));
    expect(segANodes.has('zz')).toBe(false); // keyframeless → unattributed, NOT seg-0
    expect(segANodes.has('back')).toBe(false); // full-span → spans, NOT seg-0
    // each honest bucket holds exactly its own kind:
    expect(report.spans.map((d) => d.node).sort()).toEqual(['back']); // full-span ONLY
    expect(report.unattributed.map((d) => d.node).sort()).toEqual(['zz']); // keyframeless ONLY
    expect(report.static.map((d) => d.code)).toEqual(['ID_COLLISION']); // node-less ONLY
    // seg-a still owns the genuine early entrant (cc) — the markers don't swallow real ones.
    expect(segANodes.has('cc')).toBe(true);
  });

  it('5b. TOTAL + DISJOINT: byBeat ∪ spans ∪ unattributed ∪ static = every diagnostic exactly once', () => {
    const beatNodes = report.byBeat.flatMap((g) => g.diagnostics);
    const all = [...beatNodes, ...report.spans, ...report.unattributed, ...report.static];
    // every input diagnostic lands in exactly one bucket (count-preserving, no dupes).
    expect(all).toHaveLength(result.diagnostics.length);
    expect(new Set(all).size).toBe(result.diagnostics.length);
    // and every original diagnostic object is present.
    for (const d of result.diagnostics) expect(all).toContain(d);
  });

  it('7. many nodes → one beat, deterministic canonical order (segment order; node id then code within)', () => {
    const segB = report.byBeat.find((g) => g.segId === 'seg-b');
    expect(segB?.diagnostics.map((d) => d.node)).toEqual(['aa', 'bb']); // sorted by node id
    // groups follow timing.json segment order: seg-a before seg-b (seg-c empty → absent).
    expect(report.byBeat.map((g) => g.segId)).toEqual(['seg-a', 'seg-b']);
    expect(report.static.map((d) => d.code)).toEqual(['ID_COLLISION']);
  });

  it('resolveOwningNodeId — longest-prefix walk against the node-id set', () => {
    expect(resolveOwningNodeId('aa/position.x', nodeIds)).toBe('aa');
    expect(resolveOwningNodeId('missing/opacity', nodeIds)).toBeUndefined();
  });

  it('nodeEntranceTimes — min/max keyframe per owning node, one track → one node', () => {
    const e = nodeEntranceTimes(tracks, nodeIds);
    expect(e.get('aa')).toEqual({ min: 2.0, max: 2.0 });
    expect(e.get('back')).toEqual({ min: 0, max: 5 });
    expect(e.has('zz')).toBe(false); // no track → absent → treated keyframeless
  });

  it('formatByBeatReport — renders both marker group headings verbatim, in canonical order', () => {
    const text = formatByBeatReport(result, report);
    expect(text).toContain(`spans ${SPANS_LABEL}`);
    expect(text).toContain(`unattributed ${UNATTRIBUTED_LABEL}`);
    expect(text).toContain("beat 'seg-a'");
    expect(text).toContain('static (no node):');
    // canonical section order: beats → spans → unattributed → static
    expect(text.indexOf("beat 'seg-a'")).toBeLessThan(text.indexOf(`spans ${SPANS_LABEL}`));
    expect(text.indexOf(`spans ${SPANS_LABEL}`)).toBeLessThan(text.indexOf(`unattributed ${UNATTRIBUTED_LABEL}`));
    expect(text.indexOf(`unattributed ${UNATTRIBUTED_LABEL}`)).toBeLessThan(text.indexOf('static (no node):'));
    // the locked literals — a determinism seat pins these exact strings.
    expect(SPANS_LABEL).toBe('[likely FRAME-owned]');
    expect(UNATTRIBUTED_LABEL).toBe('[no entrance keyframe]');
    // the header carries NO action text (node id is on each diagnostic line).
    expect(text).toContain('unattributed [no entrance keyframe]:');
    expect(text).not.toContain('[no entrance keyframe] →');
  });
});

// ── fail-loud (needs no scene realm — the guard trips before load) ──────────────

describe('critique --by-beat requires --timing', () => {
  it('10. --by-beat without --timing fails loud with a clear message (direct + built CLI)', async () => {
    await expect(critiqueCommand({ modulePath: SCENE, byBeat: true })).rejects.toThrow(/requires --timing/);
    if (existsSync(CLI)) {
      const res = runCli(['critique', '--by-beat', SCENE]);
      expect(res.status).not.toBe(0);
      expect(`${res.stderr}${res.stdout}`).toMatch(/requires --timing/);
    }
  });
});

// ── end-to-end through the BUILT cli binary (real single-module-graph render) ────

describe.runIf(existsSync(CLI))('gs critique --by-beat — end to end (built CLI)', () => {
  it('6. escalate boundary: a geometry lever is `suggested`; a content lever is `author decision` (BOTH present)', () => {
    const out = runCli(['critique', '--by-beat', SCENE, '--timing', TIMING]).stdout;
    expect(out).toContain('suggested fix: width'); // geometry → auto-suggestable
    expect(out).toContain('suggested fix: fontSize'); // geometry → auto-suggestable
    expect(out).toContain('author decision (meaning): text'); // content → escalate
    expect(out).not.toContain('suggested fix: text'); // a content lever is NEVER a suggested fix
  });

  it('routes each overflowing node to its DISTINCT bucket (beat / spans / unattributed) in canonical order', () => {
    const out = runCli(['critique', '--by-beat', SCENE, '--timing', TIMING]).stdout;
    // title enters at t=2.0 ∈ [1.5,3.0) → beat 'seg-b'
    expect(out).toContain("beat 'seg-b'");
    expect(out).toContain('[title]');
    // caption spans t=0…t=5 → the frame-owned spans marker
    expect(out).toContain(`spans ${SPANS_LABEL}`);
    expect(out).toContain('[caption]');
    // subtitle has NO track → the honest unattributed marker (NOT frame-owned)
    expect(out).toContain(`unattributed ${UNATTRIBUTED_LABEL}`);
    expect(out).toContain('[subtitle]');
    // canonical section order: beats → spans → unattributed
    expect(out.indexOf(`spans ${SPANS_LABEL}`)).toBeGreaterThan(out.indexOf("beat 'seg-b'"));
    expect(out.indexOf(`unattributed ${UNATTRIBUTED_LABEL}`)).toBeGreaterThan(out.indexOf(`spans ${SPANS_LABEL}`));
    // the honest keyframeless node is NOT over-claimed as frame-owned: subtitle sits
    // AFTER the spans header (i.e. in the unattributed section, not the spans one).
    expect(out.indexOf('[subtitle]')).toBeGreaterThan(out.indexOf(`unattributed ${UNATTRIBUTED_LABEL}`));
  });

  it('8. determinism: the --by-beat report text is byte-identical across two runs (text + json)', () => {
    const a = runCli(['critique', '--by-beat', SCENE, '--timing', TIMING]).stdout;
    const b = runCli(['critique', '--by-beat', SCENE, '--timing', TIMING]).stdout;
    expect(a).toBe(b);
    const ja = runCli(['critique', '--by-beat', SCENE, '--timing', TIMING, '--json']).stdout;
    const jb = runCli(['critique', '--by-beat', SCENE, '--timing', TIMING, '--json']).stdout;
    expect(ja).toBe(jb);
  });

  it('9. non-mutation: the scene module file content is unchanged after the command runs', () => {
    const before = readFileSync(SCENE, 'utf8');
    runCli(['critique', '--by-beat', SCENE, '--timing', TIMING]);
    expect(readFileSync(SCENE, 'utf8')).toBe(before);
  });

  it('the non-by-beat path is untouched (still emits the flat canonical report — no beat grouping)', () => {
    const out = runCli(['critique', SCENE]).stdout;
    expect(out).toContain('sampled');
    expect(out).toContain('TEXT_OVERFLOW');
    expect(out).not.toContain("beat 'seg-b'");
  });
});

/**
 * gs mcp session (0.28): the author→render→verify loop over Timeline Patch +
 * describe() + a single Skia frame. Exercises the session core directly (the MCP
 * stdio transport is a thin wrapper over these methods).
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { McpSession } from '../src/mcpSession.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/mcp-scene.ts', import.meta.url));
let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'gs-mcp-')); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('McpSession — discover', () => {
  it('describe() exposes the node manifest; listTargets() gives this scene\'s animatable targets', async () => {
    const s = await McpSession.load(FIXTURE);
    const manifest = s.describe();
    expect(manifest.nodes['Rect']).toBeDefined();
    expect(manifest.nodes['Rect']!.props['opacity']?.animatable).toBe(true);

    const targets = s.listTargets().map((t) => t.target);
    expect(targets).toContain('box/opacity'); // id-substituted animatable target
    expect(targets).toContain('box/position');
    // the box's targets are correctly tagged with its id + type
    const boxTargets = s.listTargets().filter((t) => t.nodeId === 'box');
    expect(boxTargets.length).toBeGreaterThan(0);
    expect(boxTargets.every((t) => t.nodeType === 'Rect')).toBe(true);
  });
});

describe('McpSession — apply / undo (validated, reversible)', () => {
  it('applies a new track to an animatable target and records a reversible inverse', async () => {
    const s = await McpSession.load(FIXTURE);
    const r = s.applyPatch([
      { op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [{ t: 0, value: 1 }, { t: 1, value: 0 }] },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.inverse.length).toBeGreaterThan(0); // undoable
    expect(s.editCount()).toBe(1);
    // the merged timeline now carries the edited track
    expect(s.mergedTimeline().tracks.some((t) => t.target === 'box/opacity')).toBe(true);

    const u = s.undo();
    expect(u.ok).toBe(true);
    expect(s.editCount()).toBe(0);
    expect(s.mergedTimeline().tracks.some((t) => t.target === 'box/opacity')).toBe(false); // reverted
  });

  it('FAILS LOUD on a non-animatable / unknown target — doc untouched (write boundary)', async () => {
    const s = await McpSession.load(FIXTURE);
    const bad = s.applyPatch([
      { op: 'setTrackKeys', timelineId: 'main', target: 'box/fill.nonsense', type: 'number', keys: [{ t: 0, value: 0 }] },
    ]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/not an animatable target/);
    const unknownNode = s.applyPatch([
      { op: 'setTrackKeys', timelineId: 'main', target: 'ghost/opacity', type: 'number', keys: [{ t: 0, value: 1 }] },
    ]);
    expect(unknownNode.ok).toBe(false);
    expect(s.editCount()).toBe(0); // nothing applied
  });

  it('FAILS LOUD on garbage keyframe VALUES — doc untouched (write boundary, not next-render)', async () => {
    // 'oops' / Infinity (JSON 1e999) on a number track used to apply ok:true and
    // only detonate at the NEXT render_frame — poisoning every later render.
    const s = await McpSession.load(FIXTURE);
    const str = s.applyPatch([
      { op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [{ t: 0, value: 'oops' as unknown as number }] },
    ]);
    expect(str.ok).toBe(false);
    if (!str.ok) expect(str.error).toMatch(/finite number/);
    const inf = s.applyPatch([
      { op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [{ t: 0, value: Infinity }] },
    ]);
    expect(inf.ok).toBe(false);
    expect(s.editCount()).toBe(0); // nothing committed, undo stack clean
    expect(s.mergedTimeline().tracks.some((t) => t.target === 'box/opacity')).toBe(false);
    // a valid patch still applies after the rejections (session not wedged)
    const good = s.applyPatch([
      { op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [{ t: 0, value: 1 }, { t: 1, value: 0 }] },
    ]);
    expect(good.ok).toBe(true);
  });

  it('undo with nothing on the stack reports cleanly', async () => {
    const s = await McpSession.load(FIXTURE);
    expect(s.undo()).toEqual({ ok: false, error: 'nothing to undo' });
  });
});

describe('McpSession — render_frame (the verifier)', () => {
  it('renders a PNG of the current scene, and a patch changes the output', async () => {
    const s = await McpSession.load(FIXTURE);
    const before = join(dir, 'before.png');
    const r = await s.renderFrame(0.5, before);
    expect(r.width).toBe(64);
    expect(existsSync(before) && statSync(before).size > 0).toBe(true);

    // hide the box via an opacity=0 track, re-render → different pixels
    s.applyPatch([{ op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [{ t: 0, value: 0 }, { t: 1, value: 0 }] }]);
    const after = join(dir, 'after.png');
    await s.renderFrame(0.5, after);
    expect(readFileSync(before).equals(readFileSync(after))).toBe(false); // the patch is reflected
  });

  it('render_frame reflects undo-to-baseline (regression: two-canary undo-to-empty staleness)', async () => {
    const s = await McpSession.load(FIXTURE);
    const base1 = join(dir, 'base1.png');
    await s.renderFrame(0.5, base1); // baseline

    // add a track that ISN'T in the code timeline, so undo returns the sidecar to EMPTY
    s.applyPatch([{ op: 'setTrackKeys', timelineId: 'main', target: 'box/opacity', type: 'number', keys: [{ t: 0, value: 0 }, { t: 1, value: 0 }] }]);
    const edited = join(dir, 'edited.png');
    await s.renderFrame(0.5, edited);
    expect(readFileSync(edited).equals(readFileSync(base1))).toBe(false); // edit reflected

    s.undo();
    expect(s.editCount()).toBe(0);
    const base2 = join(dir, 'base2.png');
    await s.renderFrame(0.5, base2); // AFTER undo-to-empty
    // the bug: this rendered the stale edited frame. Fixed: back to baseline, byte-identical.
    expect(readFileSync(base2).equals(readFileSync(base1))).toBe(true);
  });
});

/**
 * gs localize (0.42) — CLI orchestration end-to-end. Harvest a scene's t() ids +
 * string-track node-ids, fork its narration into a new locale preserving beat ids,
 * stub messages.<locale>.json, run the parity + localize preflight. Driven through
 * the BUILT dist/cli.js child (not in-process): t() records into the ambient table
 * during scene construction, and only the built graph resolves the scene's
 * `@glissade/core/i18n` to the SAME instance the CLI reads consumed ids from — an
 * in-process run splits source-vs-dist and never sees the t() ids (same reason
 * locale.test.ts drives t() through the built CLI). Writes land next to the fixture.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { NarrationScript } from '@glissade/narrate';
import type { MessageTable } from '@glissade/core/i18n';

const FIX = fileURLToPath(new URL('./fixtures/localize', import.meta.url));
const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const scene = join(FIX, 'scene.ts');
const zhNarration = join(FIX, 'scene.zh.narration.json');
const zhMessages = join(FIX, 'messages.zh.json');

const gs = (...args: string[]) =>
  spawnSync(process.execPath, [CLI, 'localize', scene, ...args], { encoding: 'utf8' });

afterEach(() => {
  rmSync(zhNarration, { force: true });
  rmSync(zhMessages, { force: true });
});

describe.runIf(existsSync(CLI))('gs localize (built CLI)', () => {
  it('dry run: reports harvested ids + a clean preflight, writes nothing, exits 0', () => {
    const r = gs('--to', 'zh', '--json');
    expect(r.status).toBe(0);
    const report = JSON.parse(r.stdout) as {
      messageIds: string[]; beatIds: string[]; narrationSource: string; wrote: string[];
      preflight: { ok: boolean; issues: unknown[] };
    };
    expect(report.messageIds).toContain('hero.title'); // the t() id
    expect(report.messageIds).toContain('captions'); // the string-track node-id
    expect(report.beatIds).toEqual(['intro', 'beat', 'outro']); // forked, ids preserved
    expect(report.narrationSource).toBe('script');
    expect(report.preflight.ok).toBe(true);
    expect(report.wrote).toEqual([]);
    expect(existsSync(zhNarration)).toBe(false);
    expect(existsSync(zhMessages)).toBe(false);
  });

  it('--write emits the forked narration (ids preserved, voice dropped) + the stubbed messages', () => {
    const r = gs('--to', 'zh', '--write');
    expect(r.status).toBe(0);

    const forked = JSON.parse(readFileSync(zhNarration, 'utf8')) as NarrationScript;
    expect(forked.segments.map((e) => e.id)).toEqual(['intro', 'beat', 'outro']); // anchors survive
    expect(forked.voice).toBeUndefined(); // locale picks its own voice
    expect((forked.segments[0] as { text: string }).text).toBe('Hello there'); // translate-me placeholder

    const msgs = JSON.parse(readFileSync(zhMessages, 'utf8')) as MessageTable;
    expect(Object.keys(msgs).sort()).toEqual(['captions', 'hero.title']); // both harvested, sorted
    expect(msgs['hero.title']).toBe(''); // no --from base → blank
  });

  it('--keep-voice retains the base voice', () => {
    gs('--to', 'zh', '--write', '--keep-voice');
    const forked = JSON.parse(readFileSync(zhNarration, 'utf8')) as NarrationScript;
    expect(forked.voice).toBe('af_heart');
  });

  it('a re-localize carries existing MESSAGE translations over (never blanks work done)', async () => {
    gs('--to', 'zh', '--write');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(zhMessages, JSON.stringify({ 'hero.title': '英雄', captions: '' }));
    gs('--to', 'zh', '--write');
    const msgs = JSON.parse(readFileSync(zhMessages, 'utf8')) as MessageTable;
    expect(msgs['hero.title']).toBe('英雄'); // carried over, not blanked
  });

  it('a re-localize CARRIES OVER translated NARRATION text by id (0.42.1 — no silent wipe)', async () => {
    gs('--to', 'zh', '--write'); // fresh fork: EN placeholders
    const { writeFileSync } = await import('node:fs');
    const forked = JSON.parse(readFileSync(zhNarration, 'utf8')) as NarrationScript;
    (forked.segments[0] as { text: string }).text = '你好翻译'; // translator does their work
    writeFileSync(zhNarration, JSON.stringify(forked, null, 2) + '\n');
    const r = gs('--to', 'zh', '--write', '--json');
    const report = JSON.parse(r.stdout) as { carriedSegments: number };
    expect(report.carriedSegments).toBeGreaterThanOrEqual(1);
    const after = JSON.parse(readFileSync(zhNarration, 'utf8')) as NarrationScript;
    expect((after.segments[0] as { text: string }).text).toBe('你好翻译'); // NOT wiped
  });

  it('--strict refuses to write + exits non-zero on a broken-anchor preflight', () => {
    gs('--to', 'zh', '--write'); // fresh fork
    const forked = JSON.parse(readFileSync(zhNarration, 'utf8')) as NarrationScript;
    forked.segments[0]!.id = 'intro-BROKEN'; // rename a beat id → parity drift
    const broken = JSON.stringify(forked, null, 2) + '\n';
    writeFileSync(zhNarration, broken);
    const r = gs('--to', 'zh', '--write', '--strict');
    expect(r.status).not.toBe(0);
    expect(readFileSync(zhNarration, 'utf8')).toBe(broken); // NOT overwritten
  });

  it('a malformed --to locale fails with a clear error and non-zero exit', () => {
    const r = gs('--to', 'Not A Locale!');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/not a locale/i);
  });
});

describe.runIf(existsSync(CLI))('gs localize — no-t() / multi-cue fast-path', () => {
  const nomsg = join(FIX, 'scene-nomsg.ts');
  const nomsgNarration = join(FIX, 'scene-nomsg.zh.narration.json');
  const nomsgMessages = join(FIX, 'messages.zh.json');
  afterEach(() => { rmSync(nomsgNarration, { force: true }); rmSync(nomsgMessages, { force: true }); });

  it('excludes the multi-cue track + skips messages.<locale>.json when nothing is localizable', () => {
    const r = spawnSync(process.execPath, [CLI, 'localize', nomsg, '--to', 'zh', '--write', '--json'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const report = JSON.parse(r.stdout) as { messageIds: string[]; wrote: string[]; preflight: { ok: boolean } };
    expect(report.messageIds).toEqual([]); // the multi-cue 'cap' node-id is NOT offered as a table target
    expect(report.preflight.ok).toBe(true); // parity-only, reaches green
    expect(existsSync(nomsgNarration)).toBe(true); // narration still forked
    expect(existsSync(nomsgMessages)).toBe(false); // no messages file — nothing to localize
  });
});

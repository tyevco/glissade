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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe.runIf(existsSync(CLI))('gs localize --tm (translation-memory staleness, narration-fork path)', () => {
  const baseNarration = join(FIX, 'scene.narration.json');
  const tmSidecar = join(FIX, 'scene.tm.zh.json');
  let baseBackup = '';

  beforeEach(() => {
    baseBackup = readFileSync(baseNarration, 'utf8');
  });
  afterEach(() => {
    writeFileSync(baseNarration, baseBackup); // restore the EN base fixture
    rmSync(zhNarration, { force: true });
    rmSync(zhMessages, { force: true });
    rmSync(tmSidecar, { force: true });
  });

  // translator does their pass: prefix every spoken segment so it's a real translation
  const translateAll = () => {
    const forked = JSON.parse(readFileSync(zhNarration, 'utf8')) as NarrationScript;
    for (const seg of forked.segments) {
      if (!('pause' in seg)) (seg as { text: string }).text = 'ZH:' + (seg as { text: string }).text;
    }
    writeFileSync(zhNarration, JSON.stringify(forked, null, 2) + '\n');
  };
  const rewordEnSegment = (idx: number, text: string) => {
    const base = JSON.parse(baseBackup) as NarrationScript;
    (base.segments[idx] as { text: string }).text = text;
    writeFileSync(baseNarration, JSON.stringify(base, null, 2) + '\n');
  };

  it('PRIMARY: reword ONE EN base segment → ONLY that segment is stale, all others reuse', () => {
    // 1) fork with --tm seeds the .tm.zh.json sidecar with the EN source hashes
    expect(gs('--to', 'zh', '--write', '--tm').status).toBe(0);
    expect(existsSync(tmSidecar)).toBe(true);
    // 2) translator translates every spoken segment
    translateAll();
    // 3) English gets reworded on exactly ONE segment ('intro')
    rewordEnSegment(0, 'Hello there, friend');
    // 4) re-localize with --tm classifies carried translations against the sidecar
    const r = gs('--to', 'zh', '--tm', '--json');
    expect(r.status).toBe(0);
    const report = JSON.parse(r.stdout) as {
      tm: { enabled: boolean; stale: number; reuse: number; staleIds: string[]; narration: { reuse: string[]; stale: string[] } };
    };
    expect(report.tm.enabled).toBe(true);
    expect(report.tm.staleIds).toEqual(['intro']); // ONLY the reworded EN segment
    expect(report.tm.narration.stale).toEqual(['intro']);
    expect(report.tm.narration.reuse).toEqual(['outro']); // unchanged EN → carried translation still valid
    expect(report.tm.stale).toBe(1);
  });

  it('UNCHANGED English → every carried translation is reuse, 0 stale', () => {
    gs('--to', 'zh', '--write', '--tm'); // seed sidecar
    translateAll();
    const report = JSON.parse(gs('--to', 'zh', '--tm', '--json').stdout) as {
      tm: { stale: number; narration: { reuse: string[]; stale: string[] } };
    };
    expect(report.tm.stale).toBe(0);
    expect(report.tm.narration.reuse).toEqual(['intro', 'outro']);
    expect(report.tm.narration.stale).toEqual([]);
  });

  it('ROUND-TRIP: --write rewrites the sidecar → the stale flag clears on the next run', () => {
    gs('--to', 'zh', '--write', '--tm'); // seed
    translateAll();
    rewordEnSegment(0, 'Hi');
    // --write both flags intro stale AND snapshots the new EN hash into the sidecar
    const r1 = JSON.parse(gs('--to', 'zh', '--write', '--tm', '--json').stdout) as {
      tm: { staleIds: string[]; wroteSidecar: boolean };
    };
    expect(r1.tm.staleIds).toEqual(['intro']);
    expect(r1.tm.wroteSidecar).toBe(true);
    // the translator re-translated intro is NOT required — re-running immediately sees a current sidecar
    const r2 = JSON.parse(gs('--to', 'zh', '--tm', '--json').stdout) as { tm: { stale: number; narration: { reuse: string[] } } };
    expect(r2.tm.stale).toBe(0); // sidecar now matches current EN → no stale
    expect(r2.tm.narration.reuse).toEqual(['intro', 'outro']);
  });

  it('without --tm the sidecar is neither read nor written (fully non-breaking)', () => {
    const report = JSON.parse(gs('--to', 'zh', '--write', '--json').stdout) as { tm: { enabled: boolean }; wrote: string[] };
    expect(report.tm.enabled).toBe(false);
    expect(existsSync(tmSidecar)).toBe(false); // no --tm → no sidecar
    expect(report.wrote.some((p) => p.endsWith('.tm.zh.json'))).toBe(false);
  });

  it('formatLocalizeReport (default text output) surfaces the stale ids to re-translate', () => {
    gs('--to', 'zh', '--write', '--tm');
    translateAll();
    rewordEnSegment(0, 'Hello there, friend');
    const r = gs('--to', 'zh', '--tm'); // no --json → human report
    expect(r.stdout).toMatch(/tm:/);
    expect(r.stdout).toMatch(/1 STALE/);
    expect(r.stdout).toMatch(/re-translate only: intro/);
  });
});

describe.runIf(existsSync(CLI))('gs localize --tm — messages-table (t()) staleness', () => {
  const enMessages = join(FIX, 'messages.en.json');
  const tmSidecar = join(FIX, 'scene.tm.zh.json');
  const gsFrom = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'localize', scene, '--to', 'zh', '--from', 'en', ...args], { encoding: 'utf8' });

  afterEach(() => {
    rmSync(enMessages, { force: true });
    rmSync(zhMessages, { force: true });
    rmSync(zhNarration, { force: true });
    rmSync(tmSidecar, { force: true });
  });

  it('reword a base-locale message → that message id is stale on re-localize', () => {
    // base-locale (en) message table the scene's t() ids translate FROM
    writeFileSync(enMessages, JSON.stringify({ 'hero.title': 'Hero', captions: 'Caption' }, null, 2));
    // 1) fork --from en --tm seeds the sidecar's messages section with the EN hashes
    gsFrom('--write', '--tm');
    expect(existsSync(tmSidecar)).toBe(true);
    // 2) translate one message in the target table
    const msgs = JSON.parse(readFileSync(zhMessages, 'utf8')) as MessageTable;
    msgs['hero.title'] = '英雄';
    writeFileSync(zhMessages, JSON.stringify(msgs, null, 2));
    // 3) reword the EN base message
    writeFileSync(enMessages, JSON.stringify({ 'hero.title': 'Champion', captions: 'Caption' }, null, 2));
    // 4) re-localize → hero.title is stale (its EN source changed); captions untouched
    const report = JSON.parse(gsFrom('--tm', '--json').stdout) as {
      tm: { staleIds: string[]; messages: { reuse: string[]; stale: string[] } };
    };
    expect(report.tm.messages.stale).toEqual(['hero.title']);
    expect(report.tm.staleIds).toContain('hero.title');
    expect(report.tm.messages.reuse).not.toContain('hero.title');
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

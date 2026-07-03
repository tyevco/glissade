/**
 * gs localize (0.42) — the PURE engine: fork a narration to a new locale
 * preserving beat ids, stub a translatable messages table, and run the SAME
 * parity + localize checks the render path runs, as a non-throwing pre-TTS report.
 */

import { describe, expect, it } from 'vitest';
import { key, timeline, track } from '@glissade/core';
import type { NarrationScript, NarrationTiming } from '@glissade/narrate';
import { forkNarrationScript, scriptFromTiming, stubMessageTable, runLocalizePreflight } from '../src/localize.js';

const baseScript: NarrationScript = {
  narrationVersion: 1,
  voice: 'af_heart',
  gap: 0.35,
  segments: [
    { id: 'intro', text: 'Hello there', voice: 'af_heart' },
    { id: 'beat', pause: 0.5, bed: 'hold' },
    { id: 'outro', text: 'Goodbye', maxSec: 3 },
  ],
};

describe('forkNarrationScript', () => {
  it('preserves every segment + pause id (so .start() anchors survive)', () => {
    const zh = forkNarrationScript(baseScript);
    expect(zh.segments.map((e) => e.id)).toEqual(['intro', 'beat', 'outro']);
  });
  it('drops the voice (script + per-segment) so the locale picks its own', () => {
    const zh = forkNarrationScript(baseScript);
    expect(zh.voice).toBeUndefined();
    expect((zh.segments[0] as { voice?: string }).voice).toBeUndefined();
  });
  it('keeps source text as a translate-me placeholder + preserves config + non-voice fields', () => {
    const zh = forkNarrationScript(baseScript);
    expect((zh.segments[0] as { text: string }).text).toBe('Hello there');
    expect((zh.segments[2] as { maxSec?: number }).maxSec).toBe(3);
    expect(zh.gap).toBe(0.35);
    expect(zh.segments[1]).toEqual({ id: 'beat', pause: 0.5, bed: 'hold' }); // pause untouched
  });
  it('keepVoice retains the voice', () => {
    expect(forkNarrationScript(baseScript, { keepVoice: true }).voice).toBe('af_heart');
  });
  it('is pure — the input script is never mutated', () => {
    const snap = JSON.stringify(baseScript);
    forkNarrationScript(baseScript);
    expect(JSON.stringify(baseScript)).toBe(snap);
  });
});

describe('scriptFromTiming (fork source when only the committed timing exists)', () => {
  const timing: NarrationTiming = {
    timingVersion: 1, provider: 'kokoro', providerVersion: 'v1', totalDuration: 5,
    segments: [
      { id: 'outro', text: 'Goodbye', start: 3, duration: 2, file: 'outro.wav' },
      { id: 'intro', text: 'Hello there', start: 0, duration: 2, file: 'intro.wav' },
    ],
    pauses: [{ id: 'beat', start: 2, duration: 1, bed: 'hold' }],
  };
  it('reconstructs playback order by start time, preserving ids + text, dropping resolved timing', () => {
    const s = scriptFromTiming(timing);
    expect(s.segments.map((e) => e.id)).toEqual(['intro', 'beat', 'outro']); // sorted by start
    expect((s.segments[0] as { text: string }).text).toBe('Hello there');
    expect(s.segments[1]).toEqual({ id: 'beat', pause: 1, bed: 'hold' }); // TimedPause.duration → pause
    expect(s.narrationVersion).toBe(1);
  });
});

describe('stubMessageTable', () => {
  it('sorts keys, uses the base string as a placeholder, blanks unknowns', () => {
    const stub = stubMessageTable(['title', 'cta'], { base: { title: 'Buy now' } });
    expect(Object.keys(stub)).toEqual(['cta', 'title']); // sorted, deterministic
    expect(stub.title).toBe('Buy now'); // placeholder from base
    expect(stub.cta).toBe(''); // no base → blank (translate-me)
  });
  it('carries EXISTING target translations over (translation-memory seed — never blanks work done)', () => {
    const stub = stubMessageTable(['title', 'cta'], { base: { title: 'Buy now', cta: 'Go' }, existing: { title: '立即购买' } });
    expect(stub.title).toBe('立即购买'); // existing wins over base
    expect(stub.cta).toBe('Go'); // no existing → base placeholder
  });
  it('dedups repeated ids', () => {
    expect(Object.keys(stubMessageTable(['a', 'a', 'b']))).toEqual(['a', 'b']);
  });
});

describe('runLocalizePreflight — the pre-TTS drift report (non-throwing)', () => {
  const doc = timeline({
    tracks: [
      track('captions/text', 'string', [key(0, 'Hello', { interp: 'hold' as const })]),
      track('circle/opacity', 'number', [key(0, 0), key(1, 1)]),
    ],
  });

  it('is OK when the locale mirrors the base ids and the stub covers every string-track node-id', () => {
    const r = runLocalizePreflight({
      locale: 'zh',
      baseManifest: { locale: 'en', ids: ['intro', 'outro'] },
      localeManifest: { locale: 'zh', ids: ['intro', 'outro'] },
      doc,
      stubTable: { captions: '' }, // covers the captions/text node-id (empty = untranslated but present)
    });
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.untranslated).toBe(1); // the empty caption stub
    expect(r.ids).toEqual(['intro', 'outro']);
  });

  it('reports a PARITY gap when the new locale is missing a base beat id (a dropped anchor)', () => {
    const r = runLocalizePreflight({
      locale: 'zh',
      baseManifest: { locale: 'en', ids: ['intro', 'beat', 'outro'] },
      localeManifest: { locale: 'zh', ids: ['intro', 'outro'] }, // dropped 'beat'
      doc,
      stubTable: { captions: 'x' },
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === 'parity' && /beat/.test(i.message))).toBe(true);
  });

  it('reports a LOCALIZE orphan for a STALE table key matching no node-id/t() id (base dropped a node)', () => {
    const r = runLocalizePreflight({
      locale: 'zh',
      baseManifest: { locale: 'en', ids: ['intro'] },
      localeManifest: { locale: 'zh', ids: ['intro'] },
      doc,
      stubTable: { captions: 'x', ghost: 'y' }, // 'ghost' matches no string-track node-id → orphan
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === 'localize' && /ghost/.test(i.message))).toBe(true);
  });

  it('surfaces BOTH a parity gap and a localize orphan in one report (catch all drift at once)', () => {
    const r = runLocalizePreflight({
      locale: 'zh',
      baseManifest: { locale: 'en', ids: ['intro', 'outro'] },
      localeManifest: { locale: 'zh', ids: ['intro'] }, // missing 'outro' → parity gap
      doc,
      stubTable: { ghost: 'y' }, // orphan key → localize gap
    });
    expect(r.issues.map((i) => i.kind).sort()).toEqual(['localize', 'parity']);
  });
});

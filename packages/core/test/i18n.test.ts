import { afterEach, describe, expect, it } from 'vitest';
import { key, timeline, track, type Timeline } from '../src/index.js';
import {
  getConsumedMessageIds,
  getMessageTable,
  localize,
  LocalizationError,
  ParityError,
  requireParity,
  setMessageTable,
  t,
} from '../src/i18n.js';

afterEach(() => setMessageTable(undefined));

describe('requireParity — pure cross-locale id-set diff', () => {
  it('passes on identical id-sets (order-independent)', () => {
    expect(() =>
      requireParity({ locale: 'en', ids: ['a', 'b', 'c'] }, { locale: 'zh', ids: ['c', 'a', 'b'] }),
    ).not.toThrow();
  });

  it('passes trivially for zero or one manifest', () => {
    expect(() => requireParity()).not.toThrow();
    expect(() => requireParity({ locale: 'en', ids: ['a'] })).not.toThrow();
  });

  it('throws naming each MISSING id per locale', () => {
    let err: unknown;
    try {
      requireParity({ locale: 'en', ids: ['a', 'b', 'c'] }, { locale: 'zh', ids: ['a'] });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ParityError);
    const msg = (err as Error).message;
    expect(msg).toContain('zh');
    expect(msg).toContain("missing 'b', 'c'");
  });

  it('throws naming an EXTRA id (present in one locale, no other)', () => {
    let err: unknown;
    try {
      requireParity({ locale: 'en', ids: ['a', 'b'] }, { locale: 'zh', ids: ['a', 'b', 'extra'] });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ParityError);
    const msg = (err as Error).message;
    // en is missing the extra id; zh declares it as extra
    expect(msg).toContain("en: missing 'extra'");
    expect(msg).toContain("zh: extra 'extra'");
  });
});

describe('localize — pure doc→doc resolver', () => {
  const makeDoc = (): Timeline =>
    timeline({
      tracks: [
        track('hero/text', 'string', [key(0, 'Hello', { interp: 'hold' as const })]),
        track('captions/text', 'string', [
          key(0, '', { interp: 'hold' as const }),
          key(1, 'A caption', { interp: 'hold' as const }),
        ]),
        track('circle/opacity', 'number', [key(0, 0), key(1, 1)]),
      ],
    });

  it('swaps string-track values whose node-id is a table key, leaving others untouched', () => {
    const doc = makeDoc();
    const out = localize(doc, { hero: '你好', captions: '一个字幕' }, { locale: 'zh' });

    const heroTrack = out.tracks.find((tr) => tr.target === 'hero/text')!;
    expect(heroTrack.keys[0]!.value).toBe('你好');

    const capTrack = out.tracks.find((tr) => tr.target === 'captions/text')!;
    // every key on a matched node-id gets the localized value
    expect(capTrack.keys.every((k) => k.value === '一个字幕')).toBe(true);

    // the number track is untouched, byte-identical reference
    const opacity = out.tracks.find((tr) => tr.target === 'circle/opacity')!;
    expect(opacity).toBe(doc.tracks.find((tr) => tr.target === 'circle/opacity'));
  });

  it('does not mutate the input doc', () => {
    const doc = makeDoc();
    const before = JSON.stringify(doc);
    localize(doc, { hero: 'X' }, { locale: 'zh' });
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('an empty table round-trips the doc structurally unchanged', () => {
    const doc = makeDoc();
    const out = localize(doc, {}, { locale: 'en' });
    expect(JSON.stringify(out)).toBe(JSON.stringify(doc));
  });

  it('throws on an orphaned table key matching no node-id and no t() id (FIX 5)', () => {
    const doc = makeDoc();
    let err: unknown;
    try {
      localize(doc, { hero: 'X', nomatch: 'Y' }, { locale: 'zh' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LocalizationError);
    const msg = (err as Error).message;
    expect(msg).toContain("'nomatch'"); // names the orphan
    expect(msg).not.toContain("'hero'"); // a matched key is not flagged
  });

  it('a fully node-id-matched table is silent (no orphan throw)', () => {
    const doc = makeDoc();
    expect(() => localize(doc, { hero: '你好', captions: '一个字幕' }, { locale: 'zh' })).not.toThrow();
  });

  it('a key consumed by a free-standing t() (consumedIds) is NOT flagged as orphaned (FIX 5)', () => {
    const doc = makeDoc();
    // 'hero' matches a node-id; 'hero.title' is a t() id (no node-id) — passing it
    // via consumedIds keeps it from being reported as an orphan.
    expect(() =>
      localize(doc, { hero: '你好', 'hero.title': '英雄' }, { locale: 'zh', consumedIds: new Set(['hero.title']) }),
    ).not.toThrow();
    // ...but an id NOT in consumedIds and NOT a node-id still throws
    expect(() =>
      localize(doc, { hero: '你好', 'stale.id': 'Z' }, { locale: 'zh', consumedIds: new Set(['hero.title']) }),
    ).toThrow(LocalizationError);
  });
});

describe('t — consumed-id tracking for the orphaned-key check (FIX 5)', () => {
  it('records resolved ids into getConsumedMessageIds; setMessageTable resets it', () => {
    setMessageTable({ 'hero.title': '英雄', 'sub.title': '副标题' });
    expect(getConsumedMessageIds().size).toBe(0);
    t('hero.title');
    expect([...getConsumedMessageIds()]).toEqual(['hero.title']);
    setMessageTable({ 'hero.title': '英雄' });
    expect(getConsumedMessageIds().size).toBe(0); // reset on a fresh table
  });
});

describe('t — build-time ambient-table sugar', () => {
  it('returns id verbatim when no table is installed (base path)', () => {
    expect(getMessageTable()).toBeUndefined();
    expect(t('hero.title')).toBe('hero.title');
  });

  it('resolves a known id against the installed table', () => {
    setMessageTable({ 'hero.title': '英雄' });
    expect(t('hero.title')).toBe('英雄');
  });

  it('HARD-FAILS on an unknown id when a table is installed', () => {
    setMessageTable({ 'hero.title': '英雄' });
    expect(() => t('missing.key')).toThrow(LocalizationError);
  });
});

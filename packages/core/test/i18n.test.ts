import { afterEach, describe, expect, it } from 'vitest';
import { key, timeline, track, type Timeline } from '../src/index.js';
import {
  getConsumedMessageIds,
  getMessageTable,
  localize,
  LocalizationError,
  ParityError,
  preservingMessageTable,
  requireParity,
  runWithMessageTable,
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

  // 0.15 FIX 4 — a within-manifest duplicate is swallowed by the Set union/diff
  it('throws naming a WITHIN-locale duplicate id (FIX 4), before the cross-locale diff', () => {
    let err: unknown;
    try {
      // both locales have the SAME id-set {a,b}, so the union/diff is clean — only
      // the within-en dup distinguishes them. It must still throw.
      requireParity({ locale: 'en', ids: ['a', 'a', 'b'] }, { locale: 'zh', ids: ['a', 'b'] });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ParityError);
    const msg = (err as Error).message;
    expect(msg).toContain('en'); // names the offending locale
    expect(msg).toContain("'a'"); // names the dup id
    expect(msg).toContain('duplicate');
  });

  it('a SINGLE manifest with a within-locale dup throws (FIX 4 runs even below the 2-manifest gate)', () => {
    expect(() => requireParity({ locale: 'fr', ids: ['x', 'x'] })).toThrow(ParityError);
  });

  it('clean manifests with no within-locale dups still pass (FIX 4 is silent when clean)', () => {
    expect(() =>
      requireParity({ locale: 'en', ids: ['a', 'b'] }, { locale: 'zh', ids: ['b', 'a'] }),
    ).not.toThrow();
  });
});

describe('localize — pure doc→doc resolver', () => {
  // a SINGLE-cue captions track (one caption held over a range — same value on
  // every key) so it localizes by broadcast; a MULTI-cue track is exercised by
  // the FIX 1 throw test below, not here.
  const makeDoc = (): Timeline =>
    timeline({
      tracks: [
        track('hero/text', 'string', [key(0, 'Hello', { interp: 'hold' as const })]),
        track('captions/text', 'string', [
          key(0, 'A caption', { interp: 'hold' as const }),
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

  // 0.15 FIX 1 — a multi-cue (>1 distinct keyed value) string track hard-throws
  it('throws on a multi-DISTINCT-value string track in the table (FIX 1 — multi-cue collapse)', () => {
    // a multi-cue caption track: two DISTINCT keyed values across the timeline
    const doc = timeline({
      tracks: [
        track('captions/text', 'string', [
          key(0, 'First cue', { interp: 'hold' as const }),
          key(1, 'Second cue', { interp: 'hold' as const }),
        ]),
      ],
    });
    let err: unknown;
    try {
      localize(doc, { captions: '一个字幕' }, { locale: 'zh' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LocalizationError);
    const msg = (err as Error).message;
    expect(msg).toContain("'captions'"); // names the offending id
    expect(msg).toContain('narration'); // directs to per-locale narration regen
  });

  it('a SINGLE-value (multi-key) string track localizes fine — not a multi-cue (FIX 1)', () => {
    // two keys but the SAME value (a hold over a range) is a single cue, not multi-cue
    const doc = timeline({
      tracks: [
        track('captions/text', 'string', [
          key(0, 'One caption', { interp: 'hold' as const }),
          key(1, 'One caption', { interp: 'hold' as const }),
        ]),
      ],
    });
    const out = localize(doc, { captions: '一个字幕' }, { locale: 'zh' });
    const tr = out.tracks.find((t2) => t2.target === 'captions/text')!;
    expect(tr.keys.every((k) => k.value === '一个字幕')).toBe(true);
  });

  // 0.15 FIX 2 — a key consumed by BOTH the node-track space AND the t() space throws
  it('throws on a key that is BOTH a node-id-string-track AND a t() id (FIX 2 — collision)', () => {
    const doc = makeDoc(); // has a 'hero/text' string track
    let err: unknown;
    try {
      // 'hero' matches the node-id string track AND is passed as a consumed t() id
      localize(doc, { hero: '你好' }, { locale: 'zh', consumedIds: new Set(['hero']) });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LocalizationError);
    const msg = (err as Error).message;
    expect(msg).toContain("'hero'"); // names the ambiguous key
    expect(msg.toLowerCase()).toContain('ambiguous');
  });

  it('a non-colliding key (t() id distinct from every node-id) is silent (FIX 2)', () => {
    const doc = makeDoc();
    // 'hero' → node track; 'hero.title' → a distinct t() id. No collision.
    expect(() =>
      localize(doc, { hero: '你好', 'hero.title': '英雄' }, { locale: 'zh', consumedIds: new Set(['hero.title']) }),
    ).not.toThrow();
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

// 0.15 FIX 3 — AsyncLocalStorage isolation of the ambient table across concurrent flows
describe('runWithMessageTable — per-flow ambient-table isolation (FIX 3)', () => {
  it('two interleaved different-locale flows do NOT cross-contaminate t()', async () => {
    // a helper that resolves t('greeting') with a yield point in the MIDDLE, so the
    // two flows are genuinely interleaved on the event loop between read and re-read.
    const resolveTwice = async (): Promise<[string, string]> => {
      const first = t('greeting');
      await Promise.resolve(); // hand control to the other flow mid-resolution
      const second = t('greeting');
      return [first, second];
    };

    const flowZh = runWithMessageTable({ greeting: '你好' }, () => resolveTwice());
    const flowFr = runWithMessageTable({ greeting: 'Bonjour' }, () => resolveTwice());
    const [[zh1, zh2], [fr1, fr2]] = await Promise.all([flowZh, flowFr]);

    // each flow sees ONLY its own locale, before AND after the interleave point
    expect([zh1, zh2]).toEqual(['你好', '你好']);
    expect([fr1, fr2]).toEqual(['Bonjour', 'Bonjour']);
  });

  it('consumed ids are tracked per-scope, not globally', async () => {
    const [zhConsumed, frConsumed] = await Promise.all([
      runWithMessageTable({ a: 'A', b: 'B' }, async () => {
        t('a');
        await Promise.resolve();
        return [...getConsumedMessageIds()];
      }),
      runWithMessageTable({ a: 'A', b: 'B' }, async () => {
        t('b');
        await Promise.resolve();
        return [...getConsumedMessageIds()];
      }),
    ]);
    expect(zhConsumed).toEqual(['a']); // flow zh only consumed 'a'
    expect(frConsumed).toEqual(['b']); // flow fr only consumed 'b'
  });

  it('a scoped flow does not leak into the process-global table (and vice-versa)', async () => {
    setMessageTable({ greeting: 'GLOBAL' });
    const scoped = await runWithMessageTable({ greeting: 'SCOPED' }, async () => t('greeting'));
    expect(scoped).toBe('SCOPED');
    // the global table is untouched by the scoped flow
    expect(t('greeting')).toBe('GLOBAL');
  });
});

// 0.15 FIX 3 — preservingMessageTable snapshots/restores the global ambient table
describe('preservingMessageTable — snapshot/restore around no-locale helpers (FIX 3)', () => {
  it('restores the global table after fn clears it (the no-locale audio-mix helper case)', async () => {
    setMessageTable({ greeting: '你好' });
    const ids = getConsumedMessageIds();
    t('greeting');
    expect([...ids]).toEqual(['greeting']);

    await preservingMessageTable(async () => {
      // simulate a no-locale helper that calls setMessageTable(undefined) internally
      setMessageTable(undefined);
      expect(getMessageTable()).toBeUndefined();
      expect(t('greeting')).toBe('greeting'); // verbatim — no table inside
    });

    // the outer locale's table + consumed set are restored byte-for-byte
    expect(getMessageTable()).toEqual({ greeting: '你好' });
    expect([...getConsumedMessageIds()]).toEqual(['greeting']);
  });

  it('restores even when fn throws', async () => {
    setMessageTable({ greeting: '你好' });
    await expect(
      preservingMessageTable(async () => {
        setMessageTable(undefined);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(getMessageTable()).toEqual({ greeting: '你好' });
  });
});

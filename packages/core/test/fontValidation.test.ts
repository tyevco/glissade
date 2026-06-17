/**
 * Font validation (§3.6): strict throws naming the family / missing glyphs;
 * dev emits a DevWarning and returns the report; generics are exempt; a
 * Latin-only face reports the emoji code point in 'héllo 👋'; a fully covered
 * usage reports nothing and never throws.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildFontRegistry,
  isExemptFamily,
  setDevWarning,
  validateFonts,
  FontValidationError,
  type FontUsage,
} from '../src/index.js';

afterEach(() => setDevWarning(() => {}));

const cps = (s: string): number[] => [...s].map((c) => c.codePointAt(0)!);
const cmap = (s: string): ReadonlySet<number> => new Set(cps(s));

describe('validateFonts — unregistered family', () => {
  it('strict throws naming the unregistered family', () => {
    const reg = buildFontRegistry({});
    const usages: FontUsage[] = [{ family: 'Brand Sans', text: 'Hi' }];
    expect(() => validateFonts(usages, reg, new Map(), 'strict')).toThrow(FontValidationError);
    try {
      validateFonts(usages, reg, new Map(), 'strict');
    } catch (e) {
      expect((e as Error).message).toContain('Brand Sans');
      expect((e as FontValidationError).report.unregistered).toEqual(['Brand Sans']);
    }
  });

  it('dev emits a DevWarning and returns the report (no throw)', () => {
    const warn = vi.fn();
    setDevWarning(warn);
    const reg = buildFontRegistry({});
    const report = validateFonts([{ family: 'Brand Sans', text: 'Hi' }], reg, new Map(), 'dev');
    expect(report.unregistered).toEqual(['Brand Sans']);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain('Brand Sans');
  });

  it('generic sans-serif is exempt — no error in strict', () => {
    const reg = buildFontRegistry({});
    expect(() => validateFonts([{ family: 'sans-serif', text: 'Hi' }], reg, new Map(), 'strict')).not.toThrow();
    expect(isExemptFamily('sans-serif')).toBe(true);
    expect(isExemptFamily('Monospace')).toBe(true); // case-insensitive
    expect(isExemptFamily('Brand Sans')).toBe(false);
  });

  it('OS families supplied by the caller are exempt', () => {
    const reg = buildFontRegistry({});
    const os = new Set(['arial']);
    expect(() =>
      validateFonts([{ family: 'Arial', text: 'Hi' }], reg, new Map(), 'strict', { osFamilies: os }),
    ).not.toThrow();
  });
});

describe('validateFonts — glyph coverage', () => {
  const reg = buildFontRegistry({ Latin: { kind: 'font', url: 'latin.ttf' } });
  const latinOnly = new Map([['Latin', cmap('héllo ')]]); // no emoji

  it("reports U+1F44B for 'héllo 👋' against a Latin-only face", () => {
    const report = validateFonts([{ family: 'Latin', text: 'héllo 👋' }], reg, latinOnly, 'dev');
    expect(report.missingGlyphs).toEqual([{ family: 'Latin', codePoints: [0x1f44b] }]);
  });

  it('strict throws and names the missing code point', () => {
    expect(() => validateFonts([{ family: 'Latin', text: 'héllo 👋' }], reg, latinOnly, 'strict')).toThrow(
      /U\+1F44B/,
    );
  });

  it('fully covered usage → empty report, no throw', () => {
    const full = new Map([['Latin', cmap('héllo 👋')]]);
    const report = validateFonts([{ family: 'Latin', text: 'héllo 👋' }], reg, full, 'strict');
    expect(report.missingGlyphs).toEqual([]);
    expect(report.unregistered).toEqual([]);
  });

  it('a fallback family that covers the glyph clears the report', () => {
    const reg2 = buildFontRegistry({
      Latin: { kind: 'font', url: 'latin.ttf', fallback: ['Emoji'] },
      Emoji: { kind: 'font', url: 'emoji.ttf' },
    });
    const cmaps = new Map([
      ['Latin', cmap('héllo ')],
      ['Emoji', cmap('👋')],
    ]);
    const report = validateFonts([{ family: 'Latin', text: 'héllo 👋' }], reg2, cmaps, 'strict');
    expect(report.missingGlyphs).toEqual([]);
  });
});

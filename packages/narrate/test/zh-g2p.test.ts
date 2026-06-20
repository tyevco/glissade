/**
 * The Chinese g2p seam (Fork B = pinned Python misaki[zh] shell-out) and its
 * PARITY against the committed oracle corpus.
 *
 * The corpus (test/fixtures/misaki-zh-parity.json) was produced ONCE from the
 * real Python misaki[zh] reference (scripts/gen-misaki-parity.py) — it is the
 * shared oracle: this test asserts the seam reproduces every entry, and a
 * future pure-TS Fork A can be checked against the same fixture offline.
 *
 * Fork B's g2p IS the Python shell-out, so the parity test RUNS the shell-out —
 * gated on misaki being importable from the configured interpreter. When misaki
 * is absent (CI without the wheel) the parity body skips, but the corpus is
 * still committed (so Fork A / a future regen has the oracle) and the
 * feature-detection + identity contract is still asserted with no Python.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NarrationError } from '../src/index.js';
import { JIEBA_PIN, MISAKI_PIN, PHONEME_MAP_VERSION, misakiZhG2p } from '../src/zh-g2p.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(
  readFileSync(join(here, 'fixtures', 'misaki-zh-parity.json'), 'utf8'),
) as { text: string; phonemes: string }[];

/** Is the misaki[zh] g2p actually reachable from the configured interpreter? */
function misakiAvailable(): boolean {
  try {
    misakiZhG2p().version();
    return true;
  } catch {
    return false;
  }
}
const MISAKI_OK = misakiAvailable();

describe('misaki-zh g2p seam (Fork B: pinned Python misaki[zh] shell-out)', () => {
  it('has a stable engine id and pins the misaki + jieba versions', () => {
    expect(misakiZhG2p().id).toBe('misaki-zh');
    expect(MISAKI_PIN).toBe('0.9.4');
    expect(JIEBA_PIN).toBe('0.42.1');
    expect(PHONEME_MAP_VERSION).toBe('zh-misaki-1');
  });

  it('a definitely-absent Python throws the install hint (ENOENT), not a silent pass', () => {
    const g = misakiZhG2p({ python: '/no/such/python-xyz' });
    expect(() => g.version()).toThrow(NarrationError);
    expect(() => g.version()).toThrow(/not found.*misaki\[zh]/s);
    expect(() => g.phonemize('你好')).toThrow(/not found.*misaki\[zh]/s);
  });

  // the committed corpus is the oracle regardless of Python presence
  it('the parity corpus exists, covers the spike line, and exercises tone sandhi', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(10);
    const hello = corpus.find((e) => e.text === '你好');
    expect(hello?.phonemes).toBe('ni↓xau↓'); // the spike line (3+3 tone sandhi)
    // arrow tone marks are the misaki[zh]-distinctive symbols — present in the corpus
    expect(corpus.some((e) => /[↓→↗↘]/.test(e.phonemes))).toBe(true);
  });

  // Fork B's g2p IS the shell-out, so parity RUNS it — gated on misaki-available.
  (MISAKI_OK ? describe : describe.skip)('parity vs the committed oracle (gated: misaki importable)', () => {
    it("version() folds the g2p identity (engine-id + jieba-dict hash + map version)", () => {
      const v = misakiZhG2p().version();
      expect(v).toMatch(/^misaki-zh /);
      expect(v).toMatch(/misaki=[\d.]+/);
      expect(v).toMatch(/jieba=[\d.]+/);
      expect(v).toMatch(/dict=[0-9a-f]{12}/); // the jieba-dict hash
      expect(v).toContain(`map=${PHONEME_MAP_VERSION}`);
    });

    it(
      'phonemize(text) reproduces every corpus entry byte-for-byte',
      () => {
        // each phonemize() is a fresh Python spawn (imports misaki + loads the
        // jieba dict, ~1s cold) — fine at prepare time, but the whole corpus
        // needs a generous timeout under the per-call shell-out.
        const g = misakiZhG2p();
        for (const { text, phonemes } of corpus) {
          expect(g.phonemize(text), `parity mismatch for ${JSON.stringify(text)}`).toBe(phonemes);
        }
      },
      120_000,
    );
  });
});

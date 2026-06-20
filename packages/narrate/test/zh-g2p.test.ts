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

import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { NarrationError } from '../src/index.js';
import { JIEBA_PIN, MISAKI_PIN, PHONEME_MAP_VERSION, misakiZhG2p } from '../src/zh-g2p.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(
  readFileSync(join(here, 'fixtures', 'misaki-zh-parity.json'), 'utf8'),
) as { text: string; phonemes: string }[];

/** Is the misaki[zh] g2p actually reachable from the configured interpreter?
 *  version() is now PURE (no Python), so availability is probed via phonemize(). */
function misakiAvailable(): boolean {
  try {
    misakiZhG2p().phonemize('你好');
    return true;
  } catch {
    return false;
  }
}
const MISAKI_OK = misakiAvailable();

// temp dirs holding throwaway "python" stubs — cleaned up after the suite
const stubDirs: string[] = [];

describe('misaki-zh g2p seam (Fork B: pinned Python misaki[zh] shell-out)', () => {
  afterAll(() => {
    for (const d of stubDirs) rmSync(d, { recursive: true, force: true });
  });

  it('has a stable engine id and pins the misaki + jieba versions', () => {
    expect(misakiZhG2p().id).toBe('misaki-zh');
    expect(MISAKI_PIN).toBe('0.9.4');
    expect(JIEBA_PIN).toBe('0.42.1');
    expect(PHONEME_MAP_VERSION).toBe('zh-misaki-1');
  });

  // FIX 3 (0.15 canary): version() is PURE + Python-free — a pin-based identity.
  it('version() is a pure pin-based identity (no Python, deterministic, folds the pins+map)', () => {
    // even an absent interpreter must NOT throw from version() — it spawns nothing
    const v = misakiZhG2p({ python: '/no/such/python-xyz' }).version();
    expect(v).toBe(`misaki-zh misaki=${MISAKI_PIN} jieba=${JIEBA_PIN} map=${PHONEME_MAP_VERSION}`);
    // stable across calls and independent of the interpreter
    expect(misakiZhG2p().version()).toBe(v);
  });

  it('a definitely-absent Python throws the install hint (ENOENT) from phonemize, not a silent pass', () => {
    const g = misakiZhG2p({ python: '/no/such/python-xyz' });
    expect(() => g.phonemize('你好')).toThrow(NarrationError);
    expect(() => g.phonemize('你好')).toThrow(/not found.*misaki\[zh]/s);
  });

  // FIX 3 (0.15 canary): a pin-mismatch at synth time raises the ACTIONABLE error
  // (never a silent 'unknown'). Driven by a POSIX-shell "python" stub that emits
  // the mismatch sentinel — needs NO real Python/misaki, just /bin/sh.
  (process.platform === 'win32' ? it.skip : it)(
    'phonemize raises an actionable error when the installed wheel diverges from the pins',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'misaki-pinstub-'));
      stubDirs.push(dir);
      const stub = join(dir, 'python-stub');
      // mimic _check_pins() finding misaki installed=0.9.3 != pinned MISAKI_PIN:
      // write `<dist>:<installed>:<pinned>` to stderr and exit 96 (the sentinel).
      writeFileSync(
        stub,
        `#!/bin/sh\nprintf 'misaki:0.9.3:${MISAKI_PIN}\\n' 1>&2\nexit 96\n`,
      );
      chmodSync(stub, 0o755);
      const g = misakiZhG2p({ python: stub });
      expect(() => g.phonemize('你好')).toThrow(NarrationError);
      expect(() => g.phonemize('你好')).toThrow(/installed misaki 0\.9\.3 != pinned MISAKI_PIN/);
    },
  );

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

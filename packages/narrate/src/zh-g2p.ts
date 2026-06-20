/**
 * '@glissade/narrate/providers' Chinese g2p seam — Mandarin text → a misaki[zh]
 * phoneme string (custom-IPA + arrow tone marks ↓→↗↘), the alphabet the kokoro
 * z* (zf_/zm_) voices were trained on. Without this, kokoro-js routes Chinese
 * through espeak-ng `cmn`, whose phonemes mismatch → garbled audio.
 *
 * Fork B = shell out to a PINNED Python misaki[zh], reusing the EXACT pattern
 * piperProvider/espeakProvider ship: spawnSync + ENOENT-is-the-only-true-absent
 * + a version() string that folds into the cache key. The shared oracle is the
 * committed parity corpus (test/fixtures/misaki-zh-parity.json) — produced ONCE
 * from this same Python reference (scripts/gen-misaki-parity.py); a future
 * pure-TS Fork A can be checked against it offline.
 *
 * DETERMINISM: g2p runs at PREPARE time (gs narrate), never at render. Its
 * identity (engine-id + jieba-dict hash + phoneme-map version + the pinned
 * misaki wheel version) folds into kokoroProvider.version(), which keys the
 * segment cache — so any g2p change invalidates stale/cross-machine audio.
 */

import { spawnSync } from 'node:child_process';
import { NarrationError } from './index.js';
import { stderrTail } from './providers.js';

/** The misaki wheel this seam is pinned to (matches scripts/gen-misaki-parity.py). */
export const MISAKI_PIN = '0.9.4';
/** The jieba dict this seam is pinned to (its segmentation drives word boundaries). */
export const JIEBA_PIN = '0.42.1';
/**
 * The phoneme-map version: bump when our text→misaki invocation changes in a way
 * that can move phoneme bytes (e.g. a normalization tweak), independent of the
 * misaki wheel. Folds into the g2p identity → the cache key.
 */
export const PHONEME_MAP_VERSION = 'zh-misaki-1';

/** The default Python interpreter; override via opts.python or MISAKI_PYTHON. */
const DEFAULT_PYTHON = 'python3';

/**
 * The Python program we shell out to. It imports misaki[zh], builds the g2p once,
 * reads the Mandarin text from stdin, prints `<phonemes>\n` to stdout, and — when
 * asked with `--id` — prints a stable identity line
 *   `misaki=<ver> jieba=<ver> dict=<sha12>`
 * (jieba dict hash included: its segmentation determines word boundaries, so a
 * dict change can move phonemes). ENOENT (python absent) is the only true
 * "g2p unavailable"; any other failure surfaces the Python traceback tail.
 */
/**
 * On a missing misaki/jieba import the program exits with this exact code (not a
 * raw traceback) so the TS side can raise the install hint — the Python-present-
 * but-misaki-absent analogue of ENOENT. Picked to not collide with 0/1/2.
 */
const MISAKI_ABSENT_EXIT = 97;

const ZH_G2P_PY = String.raw`
import sys, hashlib, os

try:
    import misaki, jieba
    from misaki import zh
except ImportError:
    sys.exit(97)

def _ident():
    mv = getattr(misaki, "__version__", "unknown")
    jv = getattr(jieba, "__version__", "unknown")
    # hash jieba's prefix dict — its segmentation drives the phoneme boundaries
    dpath = os.path.join(os.path.dirname(jieba.__file__), "dict.txt")
    try:
        with open(dpath, "rb") as f:
            dh = hashlib.sha256(f.read()).hexdigest()[:12]
    except OSError:
        dh = "nodict"
    sys.stdout.write("misaki=%s jieba=%s dict=%s\n" % (mv, jv, dh))

def _phonemize():
    g = zh.ZHG2P()
    text = sys.stdin.buffer.read().decode("utf-8")
    phonemes, _ = g(text)
    sys.stdout.buffer.write(phonemes.encode("utf-8"))

if "--id" in sys.argv[1:]:
    _ident()
else:
    _phonemize()
`;

export interface ZhG2p {
  readonly id: string;
  /** the g2p identity, folded into kokoroProvider.version() → the cache key */
  version(): string;
  /** Mandarin text → a misaki[zh] phoneme string (custom-IPA + arrow tones) */
  phonemize(text: string): string;
}

/** The shared install hint — raised when Python is absent (ENOENT) OR present
 *  but misaki/jieba can't be imported (the MISAKI_ABSENT_EXIT sentinel). */
function installHint(python: string, why: 'python' | 'misaki'): NarrationError {
  const lead =
    why === 'python'
      ? `Python ('${python}') not found on PATH for misaki[zh] g2p`
      : `misaki[zh] is not importable from '${python}'`;
  return new NarrationError(
    `${lead} — the kokoro Chinese (z*) route needs it. ` +
      `Install: \`pip install 'misaki[zh]==${MISAKI_PIN}' 'jieba==${JIEBA_PIN}'\` into that interpreter ` +
      '(or set MISAKI_PYTHON to one that has it), or use --provider piper for Chinese.',
  );
}

/** Surface a real (non-ENOENT) spawn error as a NarrationError, else null.
 *  ENOENT (python absent) becomes the install hint. */
function spawnFailure(r: ReturnType<typeof spawnSync>, python: string): NarrationError | null {
  if (!r.error) return null;
  if ((r.error as NodeJS.ErrnoException).code === 'ENOENT') return installHint(python, 'python');
  return new NarrationError(`could not run misaki[zh] g2p via '${python}': ${r.error.message}`);
}

/**
 * Fork B: shell out to a pinned Python misaki[zh]. Mirrors piperProvider — same
 * spawnSync, same ENOENT-is-the-only-true-absent feature detection, same
 * version()-parse-and-fold-into-the-cache-key contract (piper even pip-installs
 * its Python tool, so the precedent is exact).
 */
export function misakiZhG2p(opts: { python?: string } = {}): ZhG2p {
  const python = opts.python ?? process.env['MISAKI_PYTHON'] ?? DEFAULT_PYTHON;
  return {
    id: 'misaki-zh',
    version: () => {
      const r = spawnSync(python, ['-c', ZH_G2P_PY, '--id'], { encoding: 'utf8' });
      const fail = spawnFailure(r, python);
      if (fail) throw fail;
      if (r.status === MISAKI_ABSENT_EXIT) throw installHint(python, 'misaki');
      if (r.status !== 0) {
        throw new NarrationError(
          `misaki[zh] g2p not available via '${python}' (exit ${String(r.status)}): ${stderrTail(r.stderr)} — ` +
            `\`pip install 'misaki[zh]==${MISAKI_PIN}' 'jieba==${JIEBA_PIN}'\` into that interpreter.`,
        );
      }
      const ident = (r.stdout ?? '').trim();
      // engine-id + the parsed identity (misaki wheel + jieba ver + dict hash) +
      // the phoneme-map version — every piece that can move phoneme bytes
      return `misaki-zh ${ident} map=${PHONEME_MAP_VERSION}`;
    },
    phonemize: (text) => {
      const r = spawnSync(python, ['-c', ZH_G2P_PY], {
        input: text,
        maxBuffer: 8 * 1024 * 1024,
      });
      const fail = spawnFailure(r, python);
      if (fail) throw fail;
      if (r.status === MISAKI_ABSENT_EXIT) throw installHint(python, 'misaki');
      if (r.status !== 0) {
        throw new NarrationError(`misaki[zh] g2p failed: ${stderrTail(r.stderr)}`);
      }
      const out = r.stdout?.toString('utf8') ?? '';
      if (out.length === 0) {
        throw new NarrationError(`misaki[zh] g2p produced no phonemes for text: ${JSON.stringify(text.slice(0, 60))}`);
      }
      return out;
    },
  };
}

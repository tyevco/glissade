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
 * identity — a PURE pin-based string `misaki=<MISAKI_PIN> jieba=<JIEBA_PIN>
 * map=<PHONEME_MAP_VERSION>`, with NO Python (no spawn, no wheel introspection) —
 * folds UNCONDITIONALLY into kokoroProvider.version(), which keys the segment
 * cache. The pinned wheel version implies its bundled dict, so a live dict-hash is
 * not needed in the identity. Bumping any pin/map invalidates stale Mandarin audio.
 * The declared pins are ENFORCED against the installed wheel at synth time
 * (phonemize, via importlib.metadata) — a divergent wheel fails LOUDLY there.
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
 * On a missing misaki/jieba import the program exits with this exact code (not a
 * raw traceback) so the TS side can raise the install hint — the Python-present-
 * but-misaki-absent analogue of ENOENT. Picked to not collide with 0/1/2.
 */
const MISAKI_ABSENT_EXIT = 97;

/**
 * On an installed-vs-PINNED version MISMATCH the phonemize program exits with this
 * exact code so the TS side raises an actionable `installed X != pinned PIN` error
 * (never a silent 'unknown'). Distinct from MISAKI_ABSENT_EXIT (97) and 0/1/2.
 */
const MISAKI_PIN_MISMATCH_EXIT = 96;

/**
 * The phonemize Python program. It imports misaki[zh], ENFORCES the declared pins
 * (resolving the installed versions via `importlib.metadata.version(...)` — the
 * authoritative dist-info, present even when a wheel exposes no `__version__`, as
 * jieba historically does not), reads the Mandarin text from stdin, and writes
 * `<phonemes>` to stdout.
 *
 * Pin enforcement lives at SYNTH time (HERE), NOT in `version()`: `version()` is a
 * PURE pin-based identity string (no Python at all). A divergent wheel is caught
 * loudly here — on a mismatch it writes `<dist>:<installed>:<pinned>` to stderr and
 * exits MISAKI_PIN_MISMATCH_EXIT so the TS side raises an actionable error. ENOENT
 * (python absent) and ImportError (misaki absent → exit 97) remain the two
 * "g2p unavailable" exits; any other failure surfaces the Python traceback tail.
 */
const ZH_G2P_PY = String.raw`
import sys

try:
    import misaki, jieba
    from misaki import zh
    from importlib.metadata import version, PackageNotFoundError
except ImportError:
    sys.exit(97)

# pins arrive as: --pins <misaki_pin> <jieba_pin>; enforce installed==pinned
def _check_pins():
    args = sys.argv[1:]
    if "--pins" not in args:
        return
    i = args.index("--pins")
    pins = (("misaki", args[i + 1]), ("jieba", args[i + 2]))
    for dist, pin in pins:
        try:
            installed = version(dist)
        except PackageNotFoundError:
            installed = "unknown"
        if installed != pin:
            sys.stderr.write("%s:%s:%s\n" % (dist, installed, pin))
            sys.exit(96)

def _phonemize():
    g = zh.ZHG2P()
    text = sys.stdin.buffer.read().decode("utf-8")
    phonemes, _ = g(text)
    sys.stdout.buffer.write(phonemes.encode("utf-8"))

_check_pins()
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

/**
 * Raised when the installed misaki/jieba wheel diverges from the declared pins
 * (the MISAKI_PIN_MISMATCH_EXIT sentinel at synth time). The Python side wrote
 * `<dist>:<installed>:<pinned>` to stderr; we surface it as an actionable error so
 * a divergent wheel is caught LOUDLY rather than silently hashing to 'unknown'.
 */
function pinMismatchError(python: string, stderr: string | Buffer | undefined): NarrationError {
  const line = (typeof stderr === 'string' ? stderr : (stderr?.toString('utf8') ?? '')).trim().split('\n').pop() ?? '';
  const [dist, installed, pinned] = line.split(':');
  const detail =
    dist && installed && pinned
      ? `installed ${dist} ${installed} != pinned ${dist === 'misaki' ? 'MISAKI_PIN' : 'JIEBA_PIN'} ${pinned}`
      : `installed misaki/jieba wheel diverges from the declared pins (${line || 'no detail'})`;
  return new NarrationError(
    `misaki[zh] g2p pin mismatch via '${python}': ${detail} — the segment cache identity is keyed on the pins, ` +
      `so a divergent wheel would produce uncacheable/cross-machine-divergent audio. ` +
      `Install the pinned wheels: \`pip install 'misaki[zh]==${MISAKI_PIN}' 'jieba==${JIEBA_PIN}'\` into that interpreter ` +
      `(or set MISAKI_PYTHON to one that has them).`,
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
    // PURE + Python-free: the g2p identity is the DECLARED pins (the pinned wheel
    // version implies its bundled dict, so the live dict-hash is not needed in the
    // identity). Bumping MISAKI_PIN / JIEBA_PIN / PHONEME_MAP_VERSION moves this
    // string → invalidates the Mandarin segment cache. No spawnSync, no file read,
    // no `__version__` introspection — so providers.ts can ALWAYS fold it (even on
    // English-only runs, with no Python installed). The pins are ENFORCED against
    // the installed wheel at synth time (phonemize), not here.
    version: () => `misaki-zh misaki=${MISAKI_PIN} jieba=${JIEBA_PIN} map=${PHONEME_MAP_VERSION}`,
    phonemize: (text) => {
      const r = spawnSync(python, ['-c', ZH_G2P_PY, '--pins', MISAKI_PIN, JIEBA_PIN], {
        input: text,
        maxBuffer: 8 * 1024 * 1024,
      });
      const fail = spawnFailure(r, python);
      if (fail) throw fail;
      if (r.status === MISAKI_ABSENT_EXIT) throw installHint(python, 'misaki');
      if (r.status === MISAKI_PIN_MISMATCH_EXIT) throw pinMismatchError(python, r.stderr);
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

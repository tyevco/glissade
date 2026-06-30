/**
 * '@glissade/narrate/providers' English g2p seam — English text → a misaki[en]
 * phoneme string, the alphabet the kokoro English (`af_`/`am_`/`bf_`/`bm_`)
 * voices were trained on. The gh#2 ENGLISH BLEND follow-up: a blended voice has
 * no registered name, so it must drive `generate_from_ids` with a SUMMED style
 * tensor — which bypasses kokoro-js's internal English phonemizer. So, exactly as
 * the shipped Chinese blend runs misaki[zh] itself, this runs misaki[en] itself.
 *
 * Fork B = shell out to a PINNED Python misaki[en], the SAME pattern as
 * {@link './zh-g2p'} (spawnSync + ENOENT-is-the-only-true-absent + a pure
 * pin-based `version()` that folds into the cache key). misaki[en]'s G2P uses a
 * spaCy tagger (`en_core_web_sm`) + an espeak fallback for out-of-dictionary
 * words — so the install surface is heavier than zh's (misaki[en] + the spaCy
 * model + espeak-ng); each missing piece exits with a distinct code → an
 * actionable hint.
 *
 * DIALECT: US (`british=False`, the `af_`/`am_` voices) OR GB (`british=True`,
 * `bf_`/`bm_`) — `phonemize(text, british)` and `version(british)` take the
 * dialect per call (the caller derives it from the blend's voice prefixes via
 * `resolveBlend`). The dialect folds into `version()` (`dialect=us`/`gb`) so US
 * and GB never share a cache entry. A mixed US+GB blend is rejected upstream
 * (different espeak phoneme front-ends, like mixed languages).
 *
 * DETERMINISM: g2p runs at PREPARE time, never at render. Its identity — a PURE
 * pin string `misaki=<PIN> map=<MAP> dialect=us` (NO Python, no spawn) — folds
 * UNCONDITIONALLY into kokoroProvider.version() → the segment cache key. The
 * misaki dictionary (the vast majority of words) is fully pinned/deterministic;
 * OOV words route through the espeak fallback, whose phonemes depend on the local
 * espeak-ng (the one OOV-determinism caveat, shared with Kokoro's own English
 * g2p — noted, not silently swept). The pin is ENFORCED against the installed
 * wheel at synth time.
 */

import { spawnSync } from 'node:child_process';
import { NarrationError } from './index.js';
import { stderrTail } from './providers.js';
// The misaki wheel is ONE distribution; `[zh]`/`[en]` are extras of it. Pin from
// the single source of truth so the zh and en seams can never drift apart.
import { MISAKI_PIN } from './zh-g2p.js';

/**
 * The phoneme-map version: bump when our text→misaki[en] invocation changes in a
 * way that can move phoneme bytes (normalization, dialect default, fallback
 * wiring), independent of the misaki wheel. Folds into the g2p identity.
 */
export const EN_PHONEME_MAP_VERSION = 'en-misaki-1';

/** The default Python interpreter; override via opts.python or MISAKI_PYTHON
 * (shared with the zh seam — one interpreter has both extras). */
const DEFAULT_PYTHON = 'python3';

/** misaki[en] not importable (the Python-present-but-misaki-absent analogue of ENOENT). */
const MISAKI_ABSENT_EXIT = 97;
/** installed misaki wheel != the declared pin (caught loudly at synth). */
const MISAKI_PIN_MISMATCH_EXIT = 96;
/** the espeak fallback (espeakng) can't load — OOV words would be dropped. */
const ESPEAK_ABSENT_EXIT = 95;
/** the spaCy English tagger model (`en_core_web_sm`) isn't installed. */
const SPACY_MODEL_ABSENT_EXIT = 94;

/**
 * The phonemize Python program: import misaki[en], ENFORCE the misaki pin, build
 * the US-English G2P (spaCy `en_core_web_sm` tagger + espeak fallback for OOV),
 * read text from stdin, write `<phonemes>` to stdout. Each missing dependency
 * gets its OWN exit code so the TS side raises a specific install hint.
 */
const EN_G2P_PY = String.raw`
import sys

try:
    import misaki
    from misaki import en
    from importlib.metadata import version, PackageNotFoundError
except ImportError:
    sys.exit(97)

# pins arrive as: --pins <misaki_pin>; enforce installed==pinned
def _check_pins():
    args = sys.argv[1:]
    if "--pins" not in args:
        return
    i = args.index("--pins")
    pin = args[i + 1]
    try:
        installed = version("misaki")
    except PackageNotFoundError:
        installed = "unknown"
    if installed != pin:
        sys.stderr.write("misaki:%s:%s\n" % (installed, pin))
        sys.exit(96)

def _g2p():
    # dialect: --british ⇒ GB English (bf_/bm_ voices); default US (af_/am_)
    british = "--british" in sys.argv[1:]
    try:
        from misaki import espeak
        fallback = espeak.EspeakFallback(british=british)
    except Exception:
        sys.exit(95)
    try:
        g = en.G2P(trf=False, british=british, fallback=fallback)
    except OSError:
        # spaCy en_core_web_sm model not downloaded
        sys.exit(94)
    text = sys.stdin.buffer.read().decode("utf-8")
    phonemes, _ = g(text)
    sys.stdout.buffer.write((phonemes or "").encode("utf-8"))

_check_pins()
_g2p()
`;

export interface EnG2p {
  readonly id: string;
  /** the g2p identity, folded into kokoroProvider.version() → the cache key.
   *  `british` ⇒ GB dialect, a DISTINCT cache entry from US (default false). */
  version(british?: boolean): string;
  /** English text → a misaki[en] phoneme string. `british` ⇒ GB (`bf_`/`bm_`
   *  voices); default US (`af_`/`am_`). */
  phonemize(text: string, british?: boolean): string;
}

/** Install hint — Python absent (ENOENT), misaki[en] absent, or a missing
 *  sub-dependency (espeak fallback / spaCy model). */
function installHint(python: string, why: 'python' | 'misaki' | 'espeak' | 'spacy'): NarrationError {
  const lead =
    why === 'python'
      ? `Python ('${python}') not found on PATH for misaki[en] g2p`
      : why === 'misaki'
        ? `misaki[en] is not importable from '${python}'`
        : why === 'espeak'
          ? `misaki[en]'s espeak fallback is unavailable from '${python}' (needed for out-of-dictionary words)`
          : `misaki[en]'s spaCy tagger model 'en_core_web_sm' is not installed for '${python}'`;
  const fix =
    why === 'spacy'
      ? `\`${python} -m spacy download en_core_web_sm\``
      : why === 'espeak'
        ? `\`pip install misaki[en]\` AND install the espeak-ng system library (e.g. \`apt-get install espeak-ng\`)`
        : `\`pip install 'misaki[en]==${MISAKI_PIN}'\` AND \`${python} -m spacy download en_core_web_sm\` AND the espeak-ng system library`;
  return new NarrationError(
    `${lead} — the kokoro ENGLISH voice-blend route (gh#2) needs it. Install: ${fix} ` +
      `into that interpreter (or set MISAKI_PYTHON to one that has it). ` +
      `A single English voice (the named path) does NOT need this; only English BLENDS do.`,
  );
}

/** The installed misaki wheel diverges from the declared pin (caught at synth). */
function pinMismatchError(python: string, stderr: string | Buffer | undefined): NarrationError {
  const line = (typeof stderr === 'string' ? stderr : (stderr?.toString('utf8') ?? '')).trim().split('\n').pop() ?? '';
  const [, installed, pinned] = line.split(':');
  const detail =
    installed && pinned ? `installed misaki ${installed} != pinned ${pinned}` : `installed misaki wheel diverges from the declared pin (${line || 'no detail'})`;
  return new NarrationError(
    `misaki[en] g2p pin mismatch via '${python}': ${detail} — the segment cache identity is keyed on the pin, ` +
      `so a divergent wheel would produce uncacheable/cross-machine-divergent audio. ` +
      `Install the pinned wheel: \`pip install 'misaki[en]==${MISAKI_PIN}'\` into that interpreter.`,
  );
}

/** Surface a real (non-ENOENT) spawn error, else null. */
function spawnFailure(r: ReturnType<typeof spawnSync>, python: string): NarrationError | null {
  if (!r.error) return null;
  if ((r.error as NodeJS.ErrnoException).code === 'ENOENT') return installHint(python, 'python');
  return new NarrationError(`could not run misaki[en] g2p via '${python}': ${r.error.message}`);
}

/**
 * Fork B: shell out to a pinned Python misaki[en]. Mirrors {@link misakiZhG2p} —
 * same spawnSync, same ENOENT-is-the-only-true-absent feature detection, same
 * PURE pin-based version()-fold-into-the-cache-key contract.
 */
export function misakiEnG2p(opts: { python?: string } = {}): EnG2p {
  const python = opts.python ?? process.env['MISAKI_PYTHON'] ?? DEFAULT_PYTHON;
  return {
    id: 'misaki-en',
    // PURE + Python-free: the misaki pin + map + dialect. Bumping any moves this
    // string → invalidates English-blend audio. No spawn/introspection, so it
    // ALWAYS folds (even on zh-only or named-voice runs with no misaki[en]). The
    // dialect (us/gb) keys SEPARATE cache entries — GB and US never collide.
    version: (british = false) => `misaki-en misaki=${MISAKI_PIN} map=${EN_PHONEME_MAP_VERSION} dialect=${british ? 'gb' : 'us'}`,
    phonemize: (text, british = false) => {
      const args = ['-c', EN_G2P_PY, '--pins', MISAKI_PIN];
      if (british) args.push('--british'); // GB dialect for bf_/bm_ blends
      const r = spawnSync(python, args, {
        input: text,
        maxBuffer: 8 * 1024 * 1024,
      });
      const fail = spawnFailure(r, python);
      if (fail) throw fail;
      if (r.status === MISAKI_ABSENT_EXIT) throw installHint(python, 'misaki');
      if (r.status === ESPEAK_ABSENT_EXIT) throw installHint(python, 'espeak');
      if (r.status === SPACY_MODEL_ABSENT_EXIT) throw installHint(python, 'spacy');
      if (r.status === MISAKI_PIN_MISMATCH_EXIT) throw pinMismatchError(python, r.stderr);
      if (r.status !== 0) {
        throw new NarrationError(`misaki[en] g2p failed: ${stderrTail(r.stderr)}`);
      }
      const out = r.stdout?.toString('utf8') ?? '';
      if (out.length === 0) {
        throw new NarrationError(`misaki[en] g2p produced no phonemes for text: ${JSON.stringify(text.slice(0, 60))}`);
      }
      return out;
    },
  };
}

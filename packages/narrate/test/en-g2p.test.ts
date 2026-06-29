/**
 * The English g2p seam (Fork B = pinned Python misaki[en] shell-out) — the gh#2
 * ENGLISH BLEND follow-up. Mirrors zh-g2p.test.ts: a PURE Python-free `version()`
 * identity + feature-detection/install-hint error paths driven by POSIX-shell
 * "python" stubs (needs NO real Python/misaki, just /bin/sh), each emitting one
 * of the seam's distinct exit codes.
 *
 * Live phonemization parity (text → misaki[en] phonemes) needs a machine with
 * `misaki[en]` + the spaCy `en_core_web_sm` model + espeak-ng installed — that
 * runs on the consumer/validation host, not in CI.
 */

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { NarrationError } from '../src/index.js';
import { EN_PHONEME_MAP_VERSION, misakiEnG2p } from '../src/en-g2p.js';
import { MISAKI_PIN } from '../src/zh-g2p.js';

const stubDirs: string[] = [];

/** Write an executable POSIX-shell "python" stub that drains stdin (so the
 *  parent's input write completes without EPIPE) then exits with `code`,
 *  optionally emitting `stderrLine`. */
function pythonStub(code: number, stderrLine?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'misaki-en-stub-'));
  stubDirs.push(dir);
  const stub = join(dir, 'python-stub');
  const emit = stderrLine ? `printf '${stderrLine}\\n' 1>&2\n` : '';
  writeFileSync(stub, `#!/bin/sh\ncat >/dev/null 2>&1\n${emit}exit ${code}\n`);
  chmodSync(stub, 0o755);
  return stub;
}

const sh = process.platform === 'win32' ? it.skip : it;

describe('misaki-en g2p seam (Fork B: pinned Python misaki[en] shell-out)', () => {
  afterAll(() => {
    for (const d of stubDirs) rmSync(d, { recursive: true, force: true });
  });

  it('has a stable engine id and shares the misaki pin with the zh seam', () => {
    expect(misakiEnG2p().id).toBe('misaki-en');
    expect(MISAKI_PIN).toBe('0.9.4');
    expect(EN_PHONEME_MAP_VERSION).toBe('en-misaki-1');
  });

  it('version() is a pure pin-based identity (no Python, deterministic, US dialect)', () => {
    // even an absent interpreter must NOT throw from version() — it spawns nothing
    const v = misakiEnG2p({ python: '/no/such/python-xyz' }).version();
    expect(v).toBe(`misaki-en misaki=${MISAKI_PIN} map=${EN_PHONEME_MAP_VERSION} dialect=us`);
    expect(misakiEnG2p().version()).toBe(v);
  });

  it('a definitely-absent Python throws the install hint (ENOENT) from phonemize', () => {
    const g = misakiEnG2p({ python: '/no/such/python-xyz' });
    expect(() => g.phonemize('hello world')).toThrow(NarrationError);
    expect(() => g.phonemize('hello world')).toThrow(/not found.*misaki\[en]/s);
  });

  sh('exit 97 (misaki[en] not importable) → an importable-from install hint', () => {
    const g = misakiEnG2p({ python: pythonStub(97) });
    expect(() => g.phonemize('hello')).toThrow(/not importable.*misaki\[en]/s);
  });

  sh('exit 95 (espeak fallback unavailable) → a fallback install hint mentioning espeak-ng', () => {
    const g = misakiEnG2p({ python: pythonStub(95) });
    expect(() => g.phonemize('hello')).toThrow(/espeak fallback is unavailable[\s\S]*espeak-ng/);
  });

  sh("exit 94 (spaCy en_core_web_sm absent) → a 'spacy download' hint", () => {
    const g = misakiEnG2p({ python: pythonStub(94) });
    expect(() => g.phonemize('hello')).toThrow(/en_core_web_sm[\s\S]*spacy download en_core_web_sm/);
  });

  sh('exit 96 (pin mismatch) → an actionable installed!=pinned error', () => {
    const g = misakiEnG2p({ python: pythonStub(96, `misaki:0.9.3:${MISAKI_PIN}`) });
    expect(() => g.phonemize('hello')).toThrow(/installed misaki 0\.9\.3 != pinned 0\.9\.4/);
  });
});

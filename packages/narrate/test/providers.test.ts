/**
 * The prepare side: deterministic fake synthesis, the RIFF parser, and the
 * cache contract — unchanged segments never re-synthesize, changed ones
 * re-synthesize alone and re-flow downstream starts.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { NarrationError, isVoiceBlend, type NarrationScript, type VoiceBlend } from '../src/index.js';
import { JIEBA_PIN, MISAKI_PIN, PHONEME_MAP_VERSION, misakiZhG2p } from '../src/zh-g2p.js';
import {
  alignerById,
  BLEND_SPEC_VERSION,
  blendIdentity,
  blendStyleVectors,
  cacheKey,
  espeakProvider,
  fakeProvider,
  floatToWav,
  heuristicAligner,
  heuristicWords,
  interpolateMissing,
  kokoroProvider,
  mapAsrToScript,
  piperProvider,
  providerById,
  requireStringVoice,
  resolveBlend,
  resolvePiperVoice,
  scriptPathFor,
  stderrTail,
  synthesizeScript,
  voskAligner,
  wavDuration,
  type Aligner,
  type TtsProvider,
} from '../src/providers.js';

/** a real WAV (deterministic) but with the provider's word timings stripped */
function noWordsProvider(): TtsProvider {
  const fake = fakeProvider();
  return {
    id: 'nowords',
    version: () => Promise.resolve('nw-1'),
    synthesize: async (req) => {
      const r = await fake.synthesize(req);
      return { wav: r.wav, duration: r.duration };
    },
  };
}

const dir = mkdtempSync(join(tmpdir(), 'glissade-narrate-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const SCRIPT: NarrationScript = {
  narrationVersion: 1,
  provider: 'fake',
  leadIn: 0.2,
  gap: 0.3,
  segments: [
    { id: 'one', text: 'Hello there world.' },
    { id: 'two', text: 'Captions are plain data.' },
    { id: 'three', text: 'Goodbye.' },
  ],
};

function writeScript(name: string, script: NarrationScript): string {
  const p = join(dir, `${name}.narration.json`);
  writeFileSync(p, JSON.stringify(script, null, 2));
  return p;
}

describe('fakeProvider', () => {
  it('is a pure function of the request: identical bytes across calls', async () => {
    const fake = fakeProvider();
    const a = await fake.synthesize({ text: 'Determinism or bust.' });
    const b = await fake.synthesize({ text: 'Determinism or bust.' });
    expect(a.wav.equals(b.wav)).toBe(true);
    expect(a.duration).toBe(b.duration);
    expect(wavDuration(a.wav)).toBeCloseTo(a.duration, 6);
  });

  it('models reading speed and respects rate', async () => {
    const fake = fakeProvider();
    const slow = await fake.synthesize({ text: 'one two three four five six' });
    const fast = await fake.synthesize({ text: 'one two three four five six', rate: 2 });
    expect(slow.duration).toBeGreaterThan(fast.duration);
    expect(slow.words).toHaveLength(6);
    expect(slow.words![5]!.end).toBeCloseTo(slow.duration, 6);
  });
});

describe('wavDuration', () => {
  it('rejects non-RIFF input', () => {
    expect(() => wavDuration(Buffer.from('not a wav file at all, sorry!!!!!!!!!!!!!!!!'))).toThrow(
      NarrationError,
    );
  });
});

describe('providerById', () => {
  it('rejects unknown providers, listing the real ones', () => {
    expect(() => providerById('elevenlabs')).toThrow(/fake, espeak, piper, kokoro, openai/);
  });
  it('resolves kokoro', () => {
    expect(providerById('kokoro').id).toBe('kokoro');
  });
});

describe('kokoroProvider (Apache-2.0 local neural TTS via kokoro-js)', () => {
  it('version() pins lib version + model + dtype + the g2p identity (the cache key); absence throws the install hint', async () => {
    // kokoro-js is a devDep here, so version() reads its real version without
    // touching the model; a consumer without the optional peer gets the hint.
    try {
      const v = await kokoroProvider().version();
      expect(v).toMatch(/kokoro-js [\d.]+ Kokoro-82M.* dtype=q8/);
      expect(await kokoroProvider({ dtype: 'fp32' }).version()).toMatch(/dtype=fp32/);
      // FIX 1 (0.15 canary): the g2p identity is ALWAYS folded — even on a
      // no-opts (English-default) provider, which is how the real CLI path
      // (providerById('kokoro') / synthesizeScript) constructs it. version() is
      // pure, so this requires NO Python.
      expect(v).toMatch(/g2p=\[misaki-zh /);
    } catch (e) {
      expect((e as Error).message).toMatch(/kokoro-js not found.*npm install kokoro-js/s);
    }
  });

  it('version() ALWAYS folds the g2p identity even with no z* voice configured (FIX 1; no Python)', async () => {
    // the BUG: the g2p suffix used to be gated on a constructor z* voice, but the
    // real CLI constructs kokoroProvider() with NO opts and routes z* per-REQUEST
    // → the Mandarin segment cache key carried no g2p identity → a pin/map bump
    // served stale Mandarin audio. Now it's unconditional + pure.
    const need = async (): Promise<string | null> => {
      try {
        return await kokoroProvider().version(); // no voice opt
      } catch {
        return null; // kokoro-js peer absent — skip the byte assertion
      }
    };
    const v = await need();
    if (v !== null) {
      expect(v).toContain(`g2p=[misaki-zh misaki=${MISAKI_PIN} jieba=${JIEBA_PIN} map=${PHONEME_MAP_VERSION}]`);
    }
  });

  it('floatToWav is deterministic PCM16 and round-trips through wavDuration', () => {
    const samples = Float32Array.from({ length: 2400 }, (_, i) => Math.sin(i / 10) * 0.5);
    const a = floatToWav(samples, 24000);
    const b = floatToWav(samples, 24000);
    expect(a.equals(b)).toBe(true); // same samples → byte-identical
    expect(wavDuration(a)).toBeCloseTo(2400 / 24000, 9);
  });

  it('Chinese voices (z*) route through misaki[zh] g2p (0.15) — not the old hard-error', async () => {
    // 0.15 flip: z* no longer hard-errors. It runs the misaki[zh] g2p, then the
    // generate_from_ids bypass. The retired floor said "(z*) need misaki[zh] g2p
    // ... which is not wired" — that message must be GONE from every z* path.
    const g2pAvailable = (() => {
      try {
        // version() is now pure — probe actual availability via phonemize()
        misakiZhG2p().phonemize('你好');
        return true;
      } catch {
        return false;
      }
    })();

    if (!g2pAvailable) {
      // g2p absent → phonemize throws BEFORE the model loads, with the install
      // hint (Python/misaki), and NEVER the retired "not wired" floor.
      const p = kokoroProvider();
      const err = await p.synthesize({ text: '你好', voice: 'zf_xiaoxiao' }).then(
        () => null,
        (e: Error) => e,
      );
      expect(err).toBeInstanceOf(NarrationError);
      expect(err!.message).toMatch(/misaki\[zh].*pip install/s);
      expect(err!.message).not.toMatch(/not wired/);
    } else {
      // g2p present → the phoneme step succeeds; the seam reproduces the spike
      // line. (The full model round-trip is the gated KOKORO=1 test below.)
      expect(misakiZhG2p().phonemize('你好')).toBe('ni↓xau↓');
    }
  });

  it('an English voice (af_heart) is NOT caught by the z* guard', async () => {
    // The guard must not fire for non-Chinese voices: synthesize either succeeds
    // (model present) or fails for an unrelated reason (model/peer absent), but
    // NEVER with the misaki[zh] message.
    const p = kokoroProvider();
    let guardFired = false;
    try {
      await p.synthesize({ text: 'Hello world.', voice: 'af_heart' });
    } catch (e) {
      if (/misaki\[zh]/.test((e as Error).message)) guardFired = true;
    }
    expect(guardFired).toBe(false);
  }, 180_000);
});

// ---- blended kokoro voices (gh#2): weighted-sum style vectors ----
describe('blended kokoro voices (gh#2)', () => {
  it('isVoiceBlend distinguishes a blend spec from a plain string voice', () => {
    expect(isVoiceBlend('zf_xiaoni')).toBe(false);
    expect(isVoiceBlend(undefined)).toBe(false);
    expect(isVoiceBlend({ blend: [['zf_xiaoni', 0.65], ['zf_xiaoxiao', 0.35]] })).toBe(true);
  });

  it('resolveBlend normalizes weights to sum to 1 (preserving spec order)', () => {
    // [1, 1] → 50/50, not 2×
    const r = resolveBlend({ blend: [['zf_xiaoni', 1], ['zf_xiaoxiao', 1]] });
    expect(r.entries.map(([n]) => n)).toEqual(['zf_xiaoni', 'zf_xiaoxiao']); // spec order
    expect(r.entries.map(([, w]) => w)).toEqual([0.5, 0.5]);
    expect(r.language).toBe('zh');
    // arbitrary weights normalize; the SUM is 1
    const r2 = resolveBlend({ blend: [['zf_xiaoni', 0.65], ['zf_xiaoxiao', 0.35]] });
    expect(r2.entries[0]![1] + r2.entries[1]![1]).toBeCloseTo(1, 12);
    expect(r2.entries[0]![1]).toBeCloseTo(0.65, 12);
  });

  it('resolveBlend routes language by base-voice prefix (all zh / all en)', () => {
    expect(resolveBlend({ blend: [['zf_xiaoni', 1], ['zm_yunxi', 1]] }).language).toBe('zh');
    expect(resolveBlend({ blend: [['af_heart', 1], ['am_adam', 1]] }).language).toBe('en');
  });

  it('resolveBlend rejects empty / single-entry / non-finite / non-positive / mixed-language', () => {
    expect(() => resolveBlend({ blend: [] })).toThrow(/≥2 base voices/);
    expect(() => resolveBlend({ blend: [['zf_xiaoni', 1]] })).toThrow(/≥2 base voices/);
    expect(() => resolveBlend({ blend: [['zf_xiaoni', 1], ['zf_xiaoxiao', 0]] })).toThrow(/finite number > 0/);
    expect(() => resolveBlend({ blend: [['zf_xiaoni', 1], ['zf_xiaoxiao', -0.5]] })).toThrow(/finite number > 0/);
    expect(() => resolveBlend({ blend: [['zf_xiaoni', 1], ['zf_xiaoxiao', Number.NaN]] })).toThrow(/finite number > 0/);
    expect(() => resolveBlend({ blend: [['zf_xiaoni', 1], ['zf_xiaoxiao', Infinity]] })).toThrow(/finite number > 0/);
    // MIXED language (zh + en) → throws (different g2p front-ends)
    expect(() => resolveBlend({ blend: [['zf_xiaoni', 1], ['af_heart', 1]] })).toThrow(/mixes languages/);
    // empty voice name
    expect(() => resolveBlend({ blend: [['', 1], ['zf_xiaoxiao', 1]] })).toThrow(/empty voice name/);
  });

  it('blendStyleVectors computes the normalized weighted sum on small fake tensors (the math)', () => {
    // fake "voices": two 510×256 tensors of constant value 2 and 4. The 50/50
    // blend of constants 2 and 4 is constant 3; a 0.75/0.25 blend is 2.5.
    const FLOATS = 510 * 256;
    const fake = (v: number): Float32Array => new Float32Array(FLOATS).fill(v);
    const voices: Record<string, Float32Array> = { a: fake(2), b: fake(4) };
    const load = (n: string): Float32Array => voices[n]!;

    const half = resolveBlend({ blend: [['a', 1], ['b', 1]] });
    const blended = blendStyleVectors(half.entries, load);
    expect(blended.length).toBe(FLOATS);
    expect(blended[0]).toBeCloseTo(3, 6); // 0.5*2 + 0.5*4
    expect(blended[FLOATS - 1]).toBeCloseTo(3, 6);

    const skew = resolveBlend({ blend: [['a', 3], ['b', 1]] }); // 0.75 / 0.25
    const blended2 = blendStyleVectors(skew.entries, load);
    expect(blended2[0]).toBeCloseTo(2.5, 6); // 0.75*2 + 0.25*4
  });

  it('blendStyleVectors rejects a base tensor of the wrong shape (loud, not silent-truncate)', () => {
    const ok = new Float32Array(510 * 256).fill(1);
    const bad = new Float32Array(10).fill(1);
    const load = (n: string): Float32Array => (n === 'a' ? ok : bad);
    expect(() => blendStyleVectors([['a', 0.5], ['b', 0.5]], load)).toThrow(/not a valid style vector/);
  });

  it('blendIdentity is a pure, deterministic string folding names + normalized weights + version', () => {
    const id = blendIdentity({ blend: [['zf_xiaoni', 0.65], ['zf_xiaoxiao', 0.35]] });
    expect(id).toContain('zf_xiaoni:0.650000');
    expect(id).toContain('zf_xiaoxiao:0.350000');
    expect(id).toContain('lang=zh');
    expect(id).toContain(`v${BLEND_SPEC_VERSION}`);
    // [1,1] and [0.5,0.5] are the SAME blend → same identity (normalized)
    expect(blendIdentity({ blend: [['zf_xiaoni', 1], ['zf_xiaoxiao', 1]] })).toBe(
      blendIdentity({ blend: [['zf_xiaoni', 0.5], ['zf_xiaoxiao', 0.5]] }),
    );
  });

  it('cacheKey folds the blend identity: different blends/weights → different keys, same blend → stable', () => {
    const pv = 'kokoro-js 1.2.1 Kokoro-82M dtype=q8 g2p=[misaki-zh map=zh-misaki-1]';
    const seg = (voice: VoiceBlend): { text: string; voice: VoiceBlend } => ({ text: '你好', voice });
    const a = cacheKey(seg({ blend: [['zf_xiaoni', 0.65], ['zf_xiaoxiao', 0.35]] }), 'kokoro', pv);
    const aSame = cacheKey(seg({ blend: [['zf_xiaoni', 0.65], ['zf_xiaoxiao', 0.35]] }), 'kokoro', pv);
    // a DIFFERENT weight
    const b = cacheKey(seg({ blend: [['zf_xiaoni', 0.5], ['zf_xiaoxiao', 0.5]] }), 'kokoro', pv);
    // a DIFFERENT base voice
    const c = cacheKey(seg({ blend: [['zf_xiaoni', 0.65], ['zf_yunxia', 0.35]] }), 'kokoro', pv);
    expect(a).toBe(aSame); // same blend → stable key
    expect(a).not.toBe(b); // weight change → key moves
    expect(a).not.toBe(c); // base-voice change → key moves
    // a normalized-equivalent spec ([1.3, 0.7] ≡ [0.65, 0.35]) collapses to the SAME key
    const aEquiv = cacheKey(seg({ blend: [['zf_xiaoni', 1.3], ['zf_xiaoxiao', 0.7]] }), 'kokoro', pv);
    expect(a).toBe(aEquiv);
    // a plain string voice still keys distinctly
    const named = cacheKey({ text: '你好', voice: 'zf_xiaoni' }, 'kokoro', pv);
    expect(named).not.toBe(a);
  });

  it('version() folds a CONSTRUCTOR blend voice identity (the per-provider hook)', async () => {
    try {
      const v = await kokoroProvider({ voice: { blend: [['zf_xiaoni', 0.65], ['zf_xiaoxiao', 0.35]] } }).version();
      expect(v).toContain('blend=[zf_xiaoni:0.650000');
      expect(v).toContain(`v${BLEND_SPEC_VERSION}`);
      // a no-blend provider has NO blend= suffix
      expect(await kokoroProvider().version()).not.toContain('blend=');
    } catch (e) {
      // kokoro-js peer absent in this env → version() throws the install hint
      expect((e as Error).message).toMatch(/kokoro-js.*not found|could not be resolved/s);
    }
  });

  it('non-kokoro providers reject a blend voice (it is kokoro-only)', () => {
    const blend: VoiceBlend = { blend: [['a', 1], ['b', 1]] };
    expect(() => requireStringVoice(blend, 'piper')).toThrow(/does not support voice blends/);
    // synthesize on espeak surfaces the same clear error (not a [object Object] arg);
    // the guard fires synchronously inside synthesize, so assert via the call.
    expect(() => espeakProvider().synthesize({ text: 'hi', voice: blend })).toThrow(
      /does not support voice blends/,
    );
  });
});

// per-segment voice PROVENANCE in the committed timing manifest (gh#2): from the
// timing.json you can audit WHICH voice/blend produced each segment. Provider-
// agnostic — the manifest records the RESOLVED voice identity, so a fake-synth
// provider that accepts a blend voice exercises it without loading the model.
describe('synthesizeScript: per-segment voice provenance (gh#2 auditability)', () => {
  // a fake provider that accepts ANY voice (named or blend) and emits a real WAV,
  // so we can drive synthesizeScript with a blend voice without the kokoro model.
  function anyVoiceProvider(id = 'fake'): TtsProvider {
    const fake = fakeProvider();
    return { id, version: () => Promise.resolve('v-1'), synthesize: (req) => fake.synthesize(req) };
  }

  it('records the blend recipe for a blend segment and the name for a named segment', async () => {
    const blend: VoiceBlend = { blend: [['zf_xiaoni', 0.65], ['zf_xiaoxiao', 0.35]] };
    const script: NarrationScript = {
      narrationVersion: 1,
      provider: 'fake',
      segments: [
        { id: 'blended', text: '你好世界', voice: blend },
        { id: 'named', text: 'hello', voice: 'zf_xiaoxiao' },
        { id: 'default', text: 'no explicit voice' },
      ],
    };
    const r = await synthesizeScript(writeScript('provenance', script), {
      providerImpl: anyVoiceProvider(),
      alignerImpl: null,
    });
    const [blended, named, def] = r.timing.segments;
    // the blend segment carries the canonical blendIdentity() recipe — auditable
    expect(blended!.voice).toBe(blendIdentity(blend));
    expect(blended!.voice).toContain('blend=[zf_xiaoni:0.650000,zf_xiaoxiao:0.350000');
    expect(blended!.voice).toContain('lang=zh');
    expect(blended!.voice).toContain(`v${BLEND_SPEC_VERSION}`);
    // a named voice records the plain name string
    expect(named!.voice).toBe('zf_xiaoxiao');
    // no explicit voice (provider/script default) → field omitted (additive)
    expect(def!.voice).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(def, 'voice')).toBe(false);
  });

  it('inherits the script-level voice as provenance when a segment sets none', async () => {
    const script: NarrationScript = {
      narrationVersion: 1,
      provider: 'fake',
      voice: 'zf_xiaoni',
      segments: [{ id: 'inherits', text: 'uses the script default voice' }],
    };
    const r = await synthesizeScript(writeScript('provenance-inherit', script), {
      providerImpl: anyVoiceProvider(),
      alignerImpl: null,
    });
    expect(r.timing.segments[0]!.voice).toBe('zf_xiaoni');
  });

  it('the manifest round-trips (write → parse) with the provenance field intact', async () => {
    const blend: VoiceBlend = { blend: [['zf_xiaoni', 0.65], ['zf_xiaoxiao', 0.35]] };
    const script: NarrationScript = {
      narrationVersion: 1,
      provider: 'fake',
      segments: [{ id: 'blended', text: '你好', voice: blend }],
    };
    const r = await synthesizeScript(writeScript('provenance-roundtrip', script), {
      providerImpl: anyVoiceProvider(),
      alignerImpl: null,
    });
    const onDisk = JSON.parse(readFileSync(r.timingPath, 'utf8')) as {
      segments: { id: string; voice?: string }[];
    };
    expect(onDisk.segments[0]!.voice).toBe(blendIdentity(blend));
    // the in-memory result and the committed JSON agree
    expect(onDisk.segments[0]!.voice).toBe(r.timing.segments[0]!.voice);
  });
});

// gated: downloads the kokoro model (~q8 92MB) and runs onnxruntime — opt in
// with KOKORO=1 locally / in CI. This is the byte-determinism GATE for the
// provider (validated 2026-06: same text → identical PCM).
const KOKORO_GATED = process.env['KOKORO'] === '1';
(KOKORO_GATED ? describe : describe.skip)('kokoro synthesis (gated: KOKORO=1)', () => {
  it('re-synth of the same text is byte-identical (determinism contract)', async () => {
    const p = kokoroProvider({ dtype: 'q8' });
    const a = await p.synthesize({ text: 'Hello world, this is a determinism test.' });
    const b = await p.synthesize({ text: 'Hello world, this is a determinism test.' });
    expect(a.wav.equals(b.wav)).toBe(true);
    expect(a.duration).toBeCloseTo(b.duration, 9);
  }, 180_000);

  // the 0.15 headline: a z* voice synthesizes Mandarin via the misaki[zh] →
  // generate_from_ids route WITHOUT throwing (mirrors kokoro-zh-spike.test.ts).
  // Doubly gated: KOKORO=1 (model) AND misaki importable (the g2p shell-out).
  const misakiOk = (() => {
    try {
      // version() is now pure — probe actual availability via phonemize()
      misakiZhG2p().phonemize('你好');
      return true;
    } catch {
      return false;
    }
  })();
  (misakiOk ? it : it.skip)(
    'a z* voice synthesizes a Mandarin line via the misaki[zh] route (no throw)',
    async () => {
      const p = kokoroProvider({ voice: 'zf_xiaoxiao', dtype: 'q8' });
      // version() must fold the g2p identity for a z* provider (cache key)
      expect(await p.version()).toMatch(/g2p=\[misaki-zh /);
      const r = await p.synthesize({ text: '你好世界', voice: 'zf_xiaoxiao' });
      expect(r.wav.length).toBeGreaterThan(44); // real PCM, not just a header
      expect(r.duration).toBeGreaterThan(0.1);
      expect(r.duration).toBeLessThan(10);
    },
    180_000,
  );

  // gh#2: a z* BLEND synthesizes Mandarin through the model directly (summed
  // style vector) WITHOUT throwing — the consumer's e01-zh deliverable. Mirrors
  // the z* test above; doubly gated (KOKORO=1 + misaki).
  (misakiOk ? it : it.skip)(
    'a z* voice BLEND synthesizes a Mandarin line via generate_from_ids/model (no throw)',
    async () => {
      const blend: VoiceBlend = { blend: [['zf_xiaoni', 0.65], ['zf_xiaoxiao', 0.35]] };
      const p = kokoroProvider({ voice: blend, dtype: 'q8' });
      // version() folds the blend identity for a blend-constructed provider
      expect(await p.version()).toContain('blend=[zf_xiaoni:0.650000');
      const r = await p.synthesize({ text: '你好世界', voice: blend });
      expect(r.wav.length).toBeGreaterThan(44); // real PCM, not just a header
      expect(r.duration).toBeGreaterThan(0.1);
      expect(r.duration).toBeLessThan(10);
      // a blend is byte-deterministic too (no sampling) — same recipe, same bytes
      const r2 = await p.synthesize({ text: '你好世界', voice: blend });
      expect(r.wav.equals(r2.wav)).toBe(true);
    },
    180_000,
  );
});

describe('piperProvider (feature-detected, like espeak/openai)', () => {
  it('version(): present → string incl. the noise mode (cache key); absence (ENOENT) throws', async () => {
    // env-robust: piper-tts 1.x exits non-zero with no --version, so detection
    // gates on spawn ENOENT, not exit code. Present (e.g. this box) → a version
    // string carrying the noise mode (deterministic 0/0 by default); absent
    // (e.g. CI) → a clear error naming both install paths.
    try {
      expect(await piperProvider().version()).toMatch(/piper.*noise=0\/0/s);
      // a different noise mode → different cache key → re-synthesis
      expect(await piperProvider({ noiseScale: 0.5, noiseWScale: 0.8 }).version()).toMatch(/noise=0\.5\/0\.8/);
    } catch (e) {
      expect((e as Error).message).toMatch(/piper not found.*pip install piper-tts/s);
    }
  });

  it('synthesize needs a model', () => {
    expect(() => piperProvider().synthesize({ text: 'hi' })).toThrow(/needs a voice model/);
  });
});

describe('resolvePiperVoice (piper-tts 1.x needs a path/key, not a bare .onnx name)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glissade-voices-'));
  const onnx = join(dir, 'en_US-joe-medium.onnx');
  writeFileSync(onnx, 'x'); // a stand-in voice file
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('passes an existing path straight through (absolutized)', () => {
    expect(resolvePiperVoice(onnx)).toBe(onnx);
  });

  it('resolves a bare <name>.onnx under voicesDir', () => {
    expect(resolvePiperVoice('en_US-joe-medium.onnx', dir)).toBe(onnx);
  });

  it('resolves a bare key (no extension) by appending .onnx under voicesDir', () => {
    expect(resolvePiperVoice('en_US-joe-medium', dir)).toBe(onnx);
  });

  it('honors the PIPER_VOICES env when no voicesDir is given', () => {
    const prev = process.env['PIPER_VOICES'];
    process.env['PIPER_VOICES'] = dir;
    try {
      expect(resolvePiperVoice('en_US-joe-medium.onnx')).toBe(onnx);
    } finally {
      if (prev === undefined) delete process.env['PIPER_VOICES'];
      else process.env['PIPER_VOICES'] = prev;
    }
  });

  it('throws a clear error when a .onnx name resolves nowhere (names the dir)', () => {
    expect(() => resolvePiperVoice('en_US-nope-medium.onnx', dir)).toThrow(/not found.*voices dir/s);
  });

  it('passes a bare voice KEY (no .onnx) through unchanged so piper can download it', () => {
    expect(resolvePiperVoice('en_US-joe-medium', join(dir, 'empty'))).toBe('en_US-joe-medium');
  });
});

describe('stderrTail (Python tracebacks put the real exception last)', () => {
  it('returns the TAIL, not the head, when over the cap', () => {
    const head = 'Traceback (most recent call last):\n  File "__main__.py", line 143\n';
    const tail = 'ValueError: Unable to find voice: en_US-joe-medium.onnx';
    const out = stderrTail(head + 'x'.repeat(500) + '\n' + tail, 400);
    expect(out).toContain('ValueError: Unable to find voice');
    expect(out).not.toContain('Traceback (most recent call last)');
    expect(out.startsWith('…')).toBe(true);
  });

  it('passes short output through and reports empty as no output', () => {
    expect(stderrTail('boom')).toBe('boom');
    expect(stderrTail('   ')).toBe('no output');
    expect(stderrTail(undefined)).toBe('no output');
  });
});

describe('heuristicWords / heuristicAligner', () => {
  it('distributes words across the duration; spans sum to it exactly', () => {
    const words = heuristicWords('Captions are plain data', 4);
    expect(words.map((w) => w.word)).toEqual(['Captions', 'are', 'plain', 'data']);
    expect(words[0]!.start).toBe(0);
    expect(words[words.length - 1]!.end).toBeCloseTo(4, 9);
    for (let i = 1; i < words.length; i++) expect(words[i]!.start).toBeCloseTo(words[i - 1]!.end, 9);
  });

  it('weights by syllables, not characters — a 3-syllable word gets more than a 1-syllable one', () => {
    const [animation, of] = heuristicWords('animation of', 2);
    expect(animation!.end - animation!.start).toBeGreaterThan((of!.end - of!.start) * 2);
  });

  it('is a pure function (same text + duration → identical timings)', () => {
    expect(heuristicWords('one two three', 3)).toEqual(heuristicWords('one two three', 3));
  });

  it('the aligner reads its duration from the wav bytes', async () => {
    const wav = (await fakeProvider().synthesize({ text: 'one two' })).wav;
    const words = await heuristicAligner().align({ wav, text: 'one two' });
    expect(words[words.length - 1]!.end).toBeCloseTo(wavDuration(wav), 9);
  });
});

describe('alignerById', () => {
  it("'none' disables; unknown throws; ids resolve", () => {
    expect(alignerById('none')).toBeNull();
    expect(alignerById('heuristic')!.id).toBe('heuristic');
    expect(alignerById('vosk')!.id).toBe('vosk');
    expect(() => alignerById('aeneas')).toThrow(/heuristic, vosk, none/);
  });
});

describe('voskAligner (shells out to a `vosk-align` command, feature-detected)', () => {
  it('version(): present command → a string; a missing command (ENOENT) throws', async () => {
    // env-robust: with vosk-align on PATH (the vosk flake) → present; without
    // it → a clear error naming the contract. The aligner never touches the
    // broken npm `vosk`/ffi-napi binding.
    try {
      expect(await voskAligner().version()).toMatch(/vosk/);
    } catch (e) {
      expect((e as Error).message).toMatch(/not found.*vosk-align command/s);
    }
  });

  it('a definitely-absent command throws ENOENT, not a silent pass', () => {
    expect(() => voskAligner({ command: '/no/such/vosk-align-xyz' }).version()).toThrow(/not found/);
  });
});

describe('mapAsrToScript / interpolateMissing (the shared alignment core)', () => {
  it('maps clean forced-aligner words 1:1 onto the script tokens', () => {
    const timed = [
      { word: 'Captions', start: 0, end: 0.5 },
      { word: 'are', start: 0.5, end: 0.7 },
      { word: 'data', start: 0.7, end: 1.2 },
    ];
    const out = mapAsrToScript(timed, 'Captions are data');
    expect(out).toEqual(timed);
  });

  it('normalizes punctuation/case when matching (script "data." ↔ asr "data")', () => {
    const timed = [{ word: 'data', start: 1, end: 2 }];
    const out = mapAsrToScript(timed, 'Data.');
    expect(out).toEqual([{ word: 'Data.', start: 1, end: 2 }]);
  });

  it('interpolates script words the aligner did not time (ASR drift on numbers)', () => {
    // ASR spelled the number out → '$48,200' has no normalized match → interpolated
    const timed = [
      { word: 'budget', start: 0, end: 1 },
      { word: 'forty', start: 1, end: 1.3 },
      { word: 'eight', start: 1.3, end: 1.6 },
      { word: 'thousand', start: 1.6, end: 2 },
      { word: 'approved', start: 2, end: 3 },
    ];
    const out = mapAsrToScript(timed, 'budget $48,200 approved');
    expect(out.map((w) => w.word)).toEqual(['budget', '$48,200', 'approved']);
    // the middle word sits between its timed neighbours, monotonic
    expect(out[1]!.start).toBeCloseTo(1, 9); // budget.end
    expect(out[1]!.end).toBeCloseTo(2, 9); // approved.start
    for (let i = 1; i < out.length; i++) expect(out[i]!.start).toBeGreaterThanOrEqual(out[i - 1]!.start);
  });

  it('falls back to syllable distribution when nothing matches', () => {
    const timed = [{ word: 'zzz', start: 2, end: 5 }]; // matches no script word
    const out = mapAsrToScript(timed, 'one two three');
    expect(out.map((w) => w.word)).toEqual(['one', 'two', 'three']);
    expect(out[0]!.start).toBeCloseTo(2, 9); // distributed over the timed span [2,5]
    expect(out[out.length - 1]!.end).toBeCloseTo(5, 9);
  });

  it('interpolateMissing fills NaN runs between known anchors; edges clamp', () => {
    const filled = interpolateMissing([
      { word: 'a', start: 0, end: 1 },
      { word: 'b', start: NaN, end: NaN },
      { word: 'c', start: NaN, end: NaN },
      { word: 'd', start: 4, end: 5 },
    ]);
    expect(filled[1]!.start).toBeCloseTo(1, 9);
    expect(filled[2]!.end).toBeCloseTo(4, 9);
    expect(filled.every((w) => !Number.isNaN(w.start))).toBe(true);
  });
});

describe('synthesizeScript: the alignment pipeline', () => {
  const NW = noWordsProvider;

  it('a word-less provider gets words from the aligner (and reports which segments)', async () => {
    const scriptPath = writeScript('align-fill', SCRIPT);
    const r = await synthesizeScript(scriptPath, { providerImpl: NW(), alignerImpl: heuristicAligner() });
    expect(r.aligner).toBe('heuristic');
    expect(r.aligned).toEqual(['one', 'two', 'three']);
    expect(r.timing.segments[0]!.words!.length).toBeGreaterThan(0);
    // words are absolute (offset by the segment start = leadIn 0.2)
    expect(r.timing.segments[0]!.words![0]!.start).toBeCloseTo(0.2, 9);
  });

  it('provider words WIN — alignment is skipped when the provider supplies them', async () => {
    const scriptPath = writeScript('align-skip', SCRIPT);
    const r = await synthesizeScript(scriptPath, { providerImpl: fakeProvider(), alignerImpl: heuristicAligner() });
    expect(r.aligned).toEqual([]); // fake gives words; aligner untouched
    expect(r.timing.segments[0]!.words!.length).toBeGreaterThan(0);
  });

  it("align: 'none' leaves segments word-less", async () => {
    const scriptPath = writeScript('align-none', SCRIPT);
    const r = await synthesizeScript(scriptPath, { providerImpl: NW(), alignerImpl: null });
    expect(r.aligned).toEqual([]);
    expect(r.timing.segments[0]!.words).toBeUndefined();
  });

  it('a changed aligner re-derives words from the CACHED wav — no re-synthesis', async () => {
    const constAligner = (): Aligner => ({
      id: 'constal',
      version: () => Promise.resolve('c-1'),
      align: (req) => Promise.resolve([{ word: 'X', start: 0, end: wavDuration(req.wav) }]),
    });
    const scriptPath = writeScript('align-swap', SCRIPT);

    const first = await synthesizeScript(scriptPath, { providerImpl: NW(), alignerImpl: heuristicAligner() });
    expect(first.synthesized).toEqual(['one', 'two', 'three']);

    // swap the aligner: wavs are cached (synthesized empty), but words re-derive
    const second = await synthesizeScript(scriptPath, { providerImpl: NW(), alignerImpl: constAligner() });
    expect(second.synthesized).toEqual([]);
    expect(second.reused).toEqual(['one', 'two', 'three']);
    expect(second.aligned).toEqual(['one', 'two', 'three']);
    expect(second.timing.segments[0]!.words).toHaveLength(1); // the const aligner's one word

    // same aligner again: cached alignment reused, nothing re-aligned
    const third = await synthesizeScript(scriptPath, { providerImpl: NW(), alignerImpl: constAligner() });
    expect(third.aligned).toEqual([]);
    expect(third.timing.segments[0]!.words).toHaveLength(1);
  });
});

describe('synthesizeScript: the cache contract', () => {
  it('first run synthesizes everything; outputs are committable JSON', async () => {
    const scriptPath = writeScript('basic', SCRIPT);
    const r = await synthesizeScript(scriptPath);
    expect(r.synthesized).toEqual(['one', 'two', 'three']);
    expect(r.reused).toEqual([]);
    expect(r.timing.segments[0]!.start).toBe(0.2); // leadIn
    // gap flows: two starts at one.end + 0.3
    const [s1, s2] = r.timing.segments;
    expect(s2!.start).toBeCloseTo(s1!.start + s1!.duration + 0.3, 9);
    const cache = JSON.parse(readFileSync(join(r.cacheDir, 'cache.json'), 'utf8')) as {
      entries: Record<string, string>;
    };
    expect(Object.keys(cache.entries)).toHaveLength(3);
  });

  it('second run reuses everything and is byte-stable', async () => {
    const scriptPath = writeScript('stable', SCRIPT);
    const r1 = await synthesizeScript(scriptPath);
    const timing1 = readFileSync(r1.timingPath);
    const wav1 = readFileSync(join(r1.cacheDir, r1.timing.segments[0]!.file));
    const r2 = await synthesizeScript(scriptPath);
    expect(r2.synthesized).toEqual([]);
    expect(r2.reused).toEqual(['one', 'two', 'three']);
    expect(readFileSync(r2.timingPath).equals(timing1)).toBe(true);
    expect(readFileSync(join(r2.cacheDir, r2.timing.segments[0]!.file)).equals(wav1)).toBe(true);
    // word timestamps survive reuse — they are persisted in the cache manifest
    expect(r2.timing.segments[0]!.words).toEqual(r1.timing.segments[0]!.words);
    expect(r2.timing.segments[0]!.words!.length).toBeGreaterThan(0);
  });

  it('changing ONE segment re-synthesizes exactly that one and re-flows later starts', async () => {
    const scriptPath = writeScript('edit', SCRIPT);
    const before = await synthesizeScript(scriptPath);
    const edited: NarrationScript = {
      ...SCRIPT,
      segments: [
        SCRIPT.segments[0]!,
        { id: 'two', text: 'Captions are plain data, and considerably longer now than before.' },
        SCRIPT.segments[2]!,
      ],
    };
    writeFileSync(scriptPath, JSON.stringify(edited, null, 2));
    const after = await synthesizeScript(scriptPath);
    expect(after.synthesized).toEqual(['two']);
    expect(after.reused).toEqual(['one', 'three']);
    // segment one is untouched; three re-flows later because two grew
    expect(after.timing.segments[0]!.start).toBe(before.timing.segments[0]!.start);
    expect(after.timing.segments[1]!.duration).toBeGreaterThan(before.timing.segments[1]!.duration);
    expect(after.timing.segments[2]!.start).toBeGreaterThan(before.timing.segments[2]!.start);
  });

  it('--force re-synthesizes every segment', async () => {
    const scriptPath = writeScript('force', SCRIPT);
    await synthesizeScript(scriptPath);
    const r = await synthesizeScript(scriptPath, { force: true });
    expect(r.synthesized).toEqual(['one', 'two', 'three']);
  });

  // FIX 1 (0.15 canary): the real CLI path (script provider 'kokoro' → no-opts
  // kokoroProvider) routes z* per REQUEST. The cache key for a Mandarin segment
  // MUST fold the g2p identity, so a pin/map bump invalidates it. We prove this
  // end-to-end through synthesizeScript WITHOUT Python (version() is pure) by
  // injecting a stub zhG2p whose identity we move between runs.
  it('a z* segment cache key folds the g2p identity → a g2p bump re-synthesizes (FIX 1; no Python)', async () => {
    const zhScript: NarrationScript = {
      narrationVersion: 1,
      provider: 'kokoro',
      segments: [{ id: 'zh', text: '你好世界', voice: 'zf_xiaoxiao' }],
    };
    // a fake-synth kokoro provider: REAL version() (the unconditional g2p fold,
    // no Python) composed with a deterministic synthesize that emits a real WAV.
    const fake = fakeProvider();
    const mkKokoro = (g2pVersion: string): TtsProvider => {
      const stubG2p = { id: 'misaki-zh', version: () => g2pVersion, phonemize: (t: string) => t };
      let real: TtsProvider;
      try {
        real = kokoroProvider({ zhG2p: stubG2p });
      } catch {
        return null as unknown as TtsProvider; // kokoro-js peer absent → skip below
      }
      return { id: real.id, version: real.version, synthesize: (req) => fake.synthesize(req) };
    };

    const a = mkKokoro('misaki-zh map=zh-misaki-1');
    if (a === null) return; // kokoro-js not installed in this env — nothing to assert

    // the injected g2p identity must appear in the provider version (cache key)
    expect(await a.version()).toContain('g2p=[misaki-zh map=zh-misaki-1]');

    const scriptPath = writeScript('zh-cachekey', zhScript);
    const first = await synthesizeScript(scriptPath, { providerImpl: a, alignerImpl: null });
    expect(first.synthesized).toEqual(['zh']);
    const keysAfterFirst = Object.keys(
      (JSON.parse(readFileSync(join(first.cacheDir, 'cache.json'), 'utf8')) as { entries: Record<string, unknown> }).entries,
    );

    // re-run with the SAME g2p identity → reused (the cache key is stable)
    const same = await synthesizeScript(scriptPath, { providerImpl: mkKokoro('misaki-zh map=zh-misaki-1'), alignerImpl: null });
    expect(same.reused).toEqual(['zh']);
    expect(same.synthesized).toEqual([]);

    // BUMP the g2p identity (≡ a PHONEME_MAP_VERSION / pin move) → the cache key
    // changes → the Mandarin segment re-synthesizes instead of serving stale audio.
    const bumped = await synthesizeScript(scriptPath, { providerImpl: mkKokoro('misaki-zh map=zh-misaki-2'), alignerImpl: null });
    expect(bumped.synthesized).toEqual(['zh']);
    expect(bumped.reused).toEqual([]);
    const keysAfterBump = Object.keys(
      (JSON.parse(readFileSync(join(bumped.cacheDir, 'cache.json'), 'utf8')) as { entries: Record<string, unknown> }).entries,
    );
    // a brand-new key landed (the old one is left behind) — proof the key moved
    expect(keysAfterBump.length).toBe(keysAfterFirst.length + 1);
    expect(keysAfterBump.some((k) => !keysAfterFirst.includes(k))).toBe(true);
  });

  it('rejects duplicate segment ids and bad versions', async () => {
    const dup = writeScript('dup', {
      ...SCRIPT,
      segments: [
        { id: 'x', text: 'a' },
        { id: 'x', text: 'b' },
      ],
    });
    await expect(synthesizeScript(dup)).rejects.toThrow(/duplicate narration id 'x'/);
    const bad = join(dir, 'bad.narration.json');
    writeFileSync(bad, JSON.stringify({ narrationVersion: 2, segments: [] }));
    await expect(synthesizeScript(bad)).rejects.toThrow(/narrationVersion/);
  });
});

describe('scriptPathFor', () => {
  it('passes a script path through and resolves a scene module to its sibling', () => {
    const scriptPath = writeScript('scene', SCRIPT);
    expect(scriptPathFor(scriptPath)).toBe(scriptPath);
    expect(scriptPathFor(join(dir, 'scene.ts'))).toBe(scriptPath);
    expect(() => scriptPathFor(join(dir, 'missing.ts'))).toThrow(/no narration script/);
  });
});

describe('synthesizeScript: pauses', () => {
  it('a pause becomes an addressable window, suppresses the adjacent gap, and shifts later segments', async () => {
    const script: NarrationScript = {
      narrationVersion: 1,
      provider: 'fake',
      leadIn: 0.2,
      gap: 0.3,
      segments: [
        { id: 'one', text: 'Hello there world.' },
        { id: 'beat', pause: 0.5, bed: 'silence' },
        { id: 'two', text: 'After the pause.' },
      ],
    };
    const r = await synthesizeScript(writeScript('pauses', script), {
      providerImpl: fakeProvider(),
      alignerImpl: null,
    });
    const segs = r.timing.segments;
    expect(segs.map((s) => s.id)).toEqual(['one', 'two']); // pauses are NOT segments
    const oneEnd = segs[0]!.start + segs[0]!.duration;
    expect(r.timing.pauses).toEqual([{ id: 'beat', start: oneEnd, duration: 0.5, bed: 'silence' }]);
    // the gap (0.3) is suppressed: 'two' starts exactly one pause after 'one' ends
    expect(segs[1]!.start).toBeCloseTo(oneEnd + 0.5, 9);
    expect(r.timing.totalDuration).toBeCloseTo(segs[1]!.start + segs[1]!.duration, 9);
  });

  it('a trailing pause extends totalDuration; bed defaults to hold', async () => {
    const script: NarrationScript = {
      narrationVersion: 1,
      provider: 'fake',
      segments: [
        { id: 's', text: 'A word.' },
        { id: 'end', pause: 0.8 },
      ],
    };
    const r = await synthesizeScript(writeScript('trailing-pause', script), {
      providerImpl: fakeProvider(),
      alignerImpl: null,
    });
    const sEnd = r.timing.segments[0]!.start + r.timing.segments[0]!.duration;
    expect(r.timing.pauses).toEqual([{ id: 'end', start: sEnd, duration: 0.8, bed: 'hold' }]);
    expect(r.timing.totalDuration).toBeCloseTo(sEnd + 0.8, 9); // trailing silence counts
  });

  it('rejects a duplicate id (segment vs pause) and a non-positive pause', async () => {
    await expect(
      synthesizeScript(
        writeScript('dup-id', {
          narrationVersion: 1,
          provider: 'fake',
          segments: [
            { id: 'x', text: 'a' },
            { id: 'x', pause: 0.5 },
          ],
        }),
      ),
    ).rejects.toThrow(/duplicate narration id 'x'/);
    await expect(
      synthesizeScript(
        writeScript('bad-pause', {
          narrationVersion: 1,
          provider: 'fake',
          segments: [{ id: 'p', pause: 0 }],
        }),
      ),
    ).rejects.toThrow(/pause 'p' needs pause > 0/);
  });
});

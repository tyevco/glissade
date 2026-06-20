/**
 * 0.14 misaki-zh de-risking SPIKE (NOT the feature).
 *
 * The single load-bearing unknown for a future Chinese-on-kokoro engine:
 *   does the kokoro-js tokenizer accept misaki[zh]'s phoneme alphabet
 *   (custom-IPA + arrow tone marks ↓→↗↘, jieba/tone-sandhi/PaddleSpeech-derived,
 *   NOT pinyin) and map it to non-`<unk>` ids the z* voices were trained on — and
 *   does the `generate_from_ids` g2p-bypass then return audio without throwing?
 *
 * kokoro-js 1.2.1 `generate(text)` only phonemizes via espeak (en-us/en), so z*
 * text through it garbles. `generate_from_ids(input_ids, {voice})` is the ONLY
 * bypass — it takes pre-tokenized phoneme ids straight to the model. This test
 * drives that bypass with a real Mandarin Kokoro phoneme string.
 *
 * This is a RESEARCH probe. It does NOT touch the providers.ts z* hard-error
 * floor; it stays gated behind KOKORO=1 (downloads ~92MB q8 model + tokenizer).
 *
 * Reference phoneme string (Mandarin "你好" / nǐ hǎo, third-tone↓):
 *   `ni↓ xau↓`  — misaki[zh] retone() maps the 3rd-tone contour ˧˩˧ to `↓`.
 *   Source: misaki zh.py retone() (˧˩˧→↓, ˧˥→↗, ˥˩→↘, ˥→→) + the widely-cited
 *   misaki[zh] example output "ni↓xau↓" (arrows after the syllable nucleus).
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const KOKORO_GATED = process.env['KOKORO'] === '1';

const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
// "你好" in Kokoro/misaki[zh] custom-IPA with arrow tone marks. Every glyph here
// is asserted below to be a real (non-dropped) tokenizer vocab entry.
const ZH_PHONEMES = 'ni↓ xau↓';

// load kokoro-js the same way providers.test.ts does under KOKORO=1
async function loadKokoro(): Promise<{
  KokoroTTS: {
    from_pretrained(
      id: string,
      opts: { dtype?: string; device?: string },
    ): Promise<{
      tokenizer: (text: string, opts?: { truncation?: boolean }) => { input_ids: unknown };
      generate_from_ids(
        input_ids: unknown,
        opts: { voice?: string; speed?: number },
      ): Promise<{ audio: Float32Array; sampling_rate: number }>;
    }>;
  };
}> {
  const entry = createRequire(import.meta.url).resolve('kokoro-js');
  const mod = (await import(pathToFileURL(entry).href)) as Record<string, unknown>;
  const lib = (mod['KokoroTTS'] ? mod : (mod['default'] as Record<string, unknown>)) as Record<string, unknown>;
  return lib as never;
}

(KOKORO_GATED ? describe : describe.skip)('kokoro misaki-zh SPIKE (gated: KOKORO=1)', () => {
  it('the tokenizer vocab covers the misaki[zh] alphabet — Mandarin phonemes + arrow tones map to real (non-unk) ids', async () => {
    const { KokoroTTS } = await loadKokoro();
    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: 'q8', device: 'cpu' });

    // The Kokoro tokenizer is a char-isolated tokenizer whose normalizer DELETES
    // any char outside its alphabet (no <unk> — a silent drop). So a faithful
    // round-trip check is: every glyph survives, and the arrow tone marks (the
    // misaki[zh]-distinctive symbols) in particular are not dropped.
    const { input_ids } = tts.tokenizer(ZH_PHONEMES, { truncation: true }) as {
      input_ids: { dims: number[]; size?: number };
    };
    const len = input_ids.dims.at(-1) ?? 0;
    // post-processor wraps with $ … $ (2 sentinel tokens); the rest are content.
    const content = len - 2;
    // ZH_PHONEMES has 8 glyphs (incl. the space). If any were dropped, content < 8.
    expect(content).toBeGreaterThanOrEqual(ZH_PHONEMES.length);

    // Mandarin-distinctive symbols + arrow tones, each must tokenize to >0 content
    // (i.e. survive the normalizer = present in vocab = trained id).
    for (const sym of ['↓', '→', '↗', '↘', 'ɕ', 'ʂ', 'ʈ', 'ʨ', 'ŋ', 'ɤ', 'ɥ']) {
      const t = tts.tokenizer(sym) as { input_ids: { dims: number[] } };
      const c = (t.input_ids.dims.at(-1) ?? 0) - 2;
      expect(c, `symbol ${sym} was dropped by the tokenizer (not in vocab)`).toBeGreaterThan(0);
    }
  }, 180_000);

  it('generate_from_ids drives the zh phoneme string through a z* voice and returns audio (the g2p bypass works)', async () => {
    const { KokoroTTS } = await loadKokoro();
    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: 'q8', device: 'cpu' });

    const { input_ids } = tts.tokenizer(ZH_PHONEMES, { truncation: true });
    const audio = await tts.generate_from_ids(input_ids, { voice: 'zf_xiaoxiao' });

    expect(audio.audio).toBeInstanceOf(Float32Array);
    expect(audio.audio.length).toBeGreaterThan(0);
    expect(audio.sampling_rate).toBe(24000);
    // plausible duration for a 2-syllable line: a few hundred ms .. a couple s
    const seconds = audio.audio.length / audio.sampling_rate;
    expect(seconds).toBeGreaterThan(0.1);
    expect(seconds).toBeLessThan(10);

    // optional: dump a wav for a human audition (path noted in the run output)
    if (process.env['KOKORO_ZH_WAV']) {
      const { writeFileSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      // minimal 16-bit PCM WAV
      const n = audio.audio.length;
      const buf = Buffer.alloc(44 + n * 2);
      buf.write('RIFF', 0);
      buf.writeUInt32LE(36 + n * 2, 4);
      buf.write('WAVE', 8);
      buf.write('fmt ', 12);
      buf.writeUInt32LE(16, 16);
      buf.writeUInt16LE(1, 20);
      buf.writeUInt16LE(1, 22);
      buf.writeUInt32LE(audio.sampling_rate, 24);
      buf.writeUInt32LE(audio.sampling_rate * 2, 28);
      buf.writeUInt16LE(2, 32);
      buf.writeUInt16LE(16, 34);
      buf.write('data', 36);
      buf.writeUInt32LE(n * 2, 40);
      for (let i = 0; i < n; i++) {
        const s = Math.max(-1, Math.min(1, audio.audio[i]!));
        buf.writeInt16LE((s < 0 ? s * 0x8000 : s * 0x7fff) | 0, 44 + i * 2);
      }
      const out = join(tmpdir(), 'kokoro-zh-spike.wav');
      writeFileSync(out, buf);
      // eslint-disable-next-line no-console
      console.log(`[spike] wrote zh audition wav: ${out} (${seconds.toFixed(2)}s)`);
    }
  }, 180_000);
});

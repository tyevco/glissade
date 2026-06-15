/**
 * Composer cue signaling (§ad-break): cue markers → cues.json (+ VTT chapters),
 * deterministic and emitted next to the render output.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { collectCues, cuesToVtt } from '../src/cues.js';
import { render } from '../src/render.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = mkdtempSync(join(here, '.tmp-cues-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('collectCues / cuesToVtt', () => {
  it('keeps only markers carrying a data.kind, sorted by t', () => {
    const cues = collectCues([
      { t: 2, name: 'mid', data: { kind: 'ad-break', duration: 30 } },
      { t: 0.5, name: 'call:0' }, // a .call() marker — no data.kind, excluded
      { t: 1, name: 'chapter-1', data: { kind: 'chapter' } },
    ]);
    expect(cues).toEqual([
      { t: 1, kind: 'chapter', name: 'chapter-1' },
      { t: 2, kind: 'ad-break', name: 'mid', duration: 30 },
    ]);
  });

  it('renders WebVTT chapters running to duration or the next cue', () => {
    const vtt = cuesToVtt(collectCues([{ t: 1, name: 'a', data: { kind: 'ad-break', duration: 5 } }, { t: 10, name: 'b', data: { kind: 'chapter' } }]), 20);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:06.000'); // a: t..t+duration
    expect(vtt).toContain('00:00:10.000 --> 00:00:20.000'); // b: next cue absent → total duration
  });
});

describe('gs render emits cues.json (e2e)', () => {
  it('writes <stem>.cues.json with the ad-break cue', async () => {
    const mod = join(outDir, 'cued.ts');
    writeFileSync(
      mod,
      `import { timeline } from '@glissade/core';\n` +
        `import { createScene, Rect } from '@glissade/scene';\n` +
        `export default {\n` +
        `  createScene: () => createScene({ size: { w: 32, h: 32 }, children: [new Rect({ id: 'r', width: 32, height: 32, fill: '#000' })] }),\n` +
        `  timeline: timeline((tl) => { tl.to('r/opacity', 1, { duration: 2 }).adBreak(1, { id: 'midroll', duration: 30 }); }),\n` +
        `};\n`,
    );
    const out = join(outDir, 'frames');
    await render({ modulePath: mod, out, fps: 30, frameRange: [0, 2], chapters: 'vtt' });
    const cues = JSON.parse(readFileSync(join(out, 'cues.json'), 'utf8')) as { cues: unknown[] };
    expect(cues.cues).toEqual([{ t: 1, kind: 'ad-break', name: 'midroll', duration: 30 }]);
    expect(readFileSync(join(out, 'chapters.vtt'), 'utf8')).toContain('00:00:01.000 --> 00:00:31.000');
  });
});

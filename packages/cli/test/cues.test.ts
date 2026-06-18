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
  it('keeps only markers carrying a data.kind, sorted by t; extracts title', () => {
    const cues = collectCues([
      { t: 2, name: 'mid', data: { kind: 'ad-break', duration: 30 } },
      { t: 0.5, name: 'call:0' }, // a .call() marker — no data.kind, excluded
      { t: 1, name: 'chapter-1', data: { kind: 'chapter', title: 'Act One' } },
    ]);
    expect(cues).toEqual([
      { t: 1, kind: 'chapter', name: 'chapter-1', title: 'Act One' },
      { t: 2, kind: 'ad-break', name: 'mid', duration: 30 },
    ]);
  });

  it('VTT cue text is the human title (falls back to name), never the kind', () => {
    const vtt = cuesToVtt(
      collectCues([
        { t: 0, name: 'start', data: { kind: 'chapter', title: 'Cold Open' } },
        { t: 10, name: 'b', data: { kind: 'chapter' } }, // no title → name
      ]),
      20,
    );
    expect(vtt).toContain('00:00:00.000 --> 00:00:10.000\nCold Open'); // title, not 'chapter'
    expect(vtt).toContain('00:00:10.000 --> 00:00:20.000\nb'); // name fallback
    expect(vtt).not.toContain('\nchapter\n'); // kind never shown
  });

  it('auto-anchors a 00:00 Intro chapter when the first cue starts later (YouTube needs 0:00)', () => {
    const vtt = cuesToVtt(collectCues([{ t: 5, name: 'one', data: { kind: 'chapter', title: 'One' } }]), 20);
    expect(vtt).toContain('00:00:00.000 --> 00:00:05.000\nIntro');
    expect(vtt).toContain('00:00:05.000 --> 00:00:20.000\nOne');
  });

  it('no anchor when a cue already starts at 0', () => {
    const vtt = cuesToVtt(collectCues([{ t: 0, name: 'zero', data: { kind: 'chapter', title: 'Zero' } }]), 20);
    expect(vtt).not.toContain('Intro');
    expect(vtt).toContain('00:00:00.000 --> 00:00:20.000\nZero');
  });

  it('VTT includes only chapter-kind cues by default; a kinds override widens it', () => {
    const cues = collectCues([
      { t: 1, name: 'ch', data: { kind: 'chapter', title: 'One' } },
      { t: 2, name: 'ad', data: { kind: 'ad-break', duration: 5 } },
    ]);
    const def = cuesToVtt(cues, 10);
    expect(def).toContain('One');
    expect(def).not.toContain('00:00:02'); // the ad-break is filtered out of chapters
    const both = cuesToVtt(cues, 10, new Set(['chapter', 'ad-break']));
    expect(both).toContain('One');
    expect(both).toContain('00:00:02.000 --> 00:00:07.000'); // ad-break now included (t..t+dur)
  });
});

describe('gs render emits cues.json (e2e)', () => {
  it('cues.json keeps all kinds; chapters.vtt holds only chapter cues', async () => {
    const mod = join(outDir, 'cued.ts');
    writeFileSync(
      mod,
      `import { timeline } from '@glissade/core';\n` +
        `import { createScene, Rect } from '@glissade/scene';\n` +
        `export default {\n` +
        `  createScene: () => createScene({ size: { w: 32, h: 32 }, children: [new Rect({ id: 'r', width: 32, height: 32, fill: '#000' })] }),\n` +
        `  timeline: timeline((tl) => { tl.to('r/opacity', 1, { duration: 2 }).cue(0.5, 'open', { kind: 'chapter', title: 'Cold Open' }).adBreak(1, { id: 'midroll', duration: 30 }); }),\n` +
        `};\n`,
    );
    const out = join(outDir, 'frames');
    await render({ modulePath: mod, out, fps: 30, frameRange: [0, 2], chapters: 'vtt' });
    const cues = JSON.parse(readFileSync(join(out, 'cues.json'), 'utf8')) as { cues: { kind: string }[] };
    // cues.json is the machine superset — every kind
    expect(cues.cues.map((c) => c.kind).sort()).toEqual(['ad-break', 'chapter']);
    const vtt = readFileSync(join(out, 'chapters.vtt'), 'utf8');
    expect(vtt).toContain('Cold Open'); // the chapter cue
    expect(vtt).not.toContain('midroll'); // the ad-break is excluded from chapters
  });
});

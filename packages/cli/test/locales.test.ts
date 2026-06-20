/**
 * gs render --locales <a,b,c> (0.15 fan-out): render the scene ONCE PER locale
 * over the existing 0.14 --locale path, writing one artifact per locale to a
 * DISTINCT per-locale output path. Pure CLI orchestration — no render-path
 * change, so a per-locale render is byte-for-byte the 0.14 single --locale render.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { render, renderLocales, parseLocalesList, localeOutPath, LocaleArgsError } from '../src/render.js';
import { messagesFileFor, localeNarrationPathFor, UnknownLocaleError } from '../src/locale.js';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'glissade-locales-'));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const SCENE_SRC = `
import { Text, createScene } from '@glissade/scene';
import { key, timeline, track } from '@glissade/core';

const SIZE = { w: 64, h: 64 };

export default {
  createScene: () =>
    createScene({
      size: SIZE,
      children: [
        new Text({ id: 'hero', text: 'BASE-HERO', fontSize: 12, fill: '#ffffff', position: [4, 20] }),
      ],
    }),
  timeline: timeline({
    fps: 30,
    duration: 1,
    tracks: [track('hero/text', 'string', [key(0, 'BASE-HERO', { interp: 'hold' })])],
  }),
};
`;

function writeScene(dir: string): string {
  const p = join(dir, 'scene.ts');
  writeFileSync(p, SCENE_SRC);
  return p;
}

const sha = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

describe('parseLocalesList', () => {
  it('splits a comma-separated list, preserving order', () => {
    expect(parseLocalesList('en,zh,ja')).toEqual(['en', 'zh', 'ja']);
  });
  it('trims whitespace and drops empty entries', () => {
    expect(parseLocalesList(' en , zh ,, ')).toEqual(['en', 'zh']);
  });
  it('de-duplicates while preserving first-seen order', () => {
    expect(parseLocalesList('en,zh,en,ja,zh')).toEqual(['en', 'zh', 'ja']);
  });
  it('throws LocaleArgsError on an all-empty list', () => {
    expect(() => parseLocalesList('  , , ')).toThrow(LocaleArgsError);
  });
});

describe('localeOutPath (per-locale output convention)', () => {
  it('inserts a locale segment before a video extension', () => {
    expect(localeOutPath('out/episode.mp4', 'zh')).toBe('out/episode.zh.mp4');
    expect(localeOutPath('out/episode.webm', 'en')).toBe('out/episode.en.webm');
  });
  it('inserts a locale segment before a .png file extension', () => {
    expect(localeOutPath('out/still.png', 'ja')).toBe('out/still.ja.png');
  });
  it('appends a per-locale subdir for a directory output', () => {
    expect(localeOutPath('out', 'zh')).toBe(join('out', 'zh'));
    expect(localeOutPath('dist/frames', 'en')).toBe(join('dist/frames', 'en'));
  });
  it('--format png-seq forces the directory convention even for a video name', () => {
    expect(localeOutPath('out/episode.mp4', 'zh', 'png-seq')).toBe(join('out/episode.mp4', 'zh'));
  });
});

describe('renderLocales (fan-out, in-process)', () => {
  it('writes BOTH per-locale artifacts to distinct paths', async () => {
    const dir = tmp();
    const scene = writeScene(dir);
    writeFileSync(messagesFileFor(scene, 'en'), JSON.stringify({ hero: 'EN-HERO' }));
    writeFileSync(messagesFileFor(scene, 'zh'), JSON.stringify({ hero: '本地英雄' }));
    const out = join(dir, 'still.png');

    const results = await renderLocales(
      { modulePath: scene, out, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off' },
      ['en', 'zh'],
    );

    expect(results.map((r) => r.locale)).toEqual(['en', 'zh']);
    const enOut = localeOutPath(out, 'en');
    const zhOut = localeOutPath(out, 'zh');
    expect(enOut).not.toBe(zhOut);
    expect(existsSync(enOut)).toBe(true);
    expect(existsSync(zhOut)).toBe(true);
    // distinct locales → distinct localized text → distinct bytes
    expect(sha(readFileSync(enOut))).not.toBe(sha(readFileSync(zhOut)));
  });

  it('a per-locale render equals the equivalent single --locale render (byte-identical)', async () => {
    const dir = tmp();
    const scene = writeScene(dir);
    writeFileSync(messagesFileFor(scene, 'zh'), JSON.stringify({ hero: '本地英雄' }));

    const fanOut = join(dir, 'fan.png');
    await renderLocales(
      { modulePath: scene, out: fanOut, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off' },
      ['zh'],
    );
    const single = join(dir, 'single.png');
    await render({ modulePath: scene, out: single, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off', locale: 'zh' });

    expect(sha(readFileSync(localeOutPath(fanOut, 'zh')))).toBe(sha(readFileSync(single)));
  });

  it('a bad locale in the list throws UnknownLocaleError naming it (no silent skip)', async () => {
    const dir = tmp();
    const scene = writeScene(dir);
    writeFileSync(messagesFileFor(scene, 'en'), JSON.stringify({ hero: 'EN-HERO' }));
    // 'xx' has neither a messages file nor a narration sibling → unresolvable
    const out = join(dir, 'still.png');
    await expect(
      renderLocales(
        { modulePath: scene, out, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off' },
        ['en', 'xx'],
      ),
    ).rejects.toThrow(UnknownLocaleError);
    await expect(
      renderLocales(
        { modulePath: scene, out, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off' },
        ['en', 'xx'],
      ),
    ).rejects.toThrow(/xx/);
  });

  it('a narration-only locale (sibling present, no messages file) still renders in the fan-out', async () => {
    const dir = tmp();
    const scene = writeScene(dir);
    const stub = JSON.stringify({ timingVersion: 1, provider: 'x', providerVersion: '0', totalDuration: 1, segments: [] });
    writeFileSync(localeNarrationPathFor(scene, 'xx'), stub);
    const out = join(dir, 'still.png');
    const results = await renderLocales(
      { modulePath: scene, out, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off' },
      ['xx'],
    );
    expect(results).toHaveLength(1);
    expect(existsSync(localeOutPath(out, 'xx'))).toBe(true);
  });
});

// The full CLI dispatch (--locales / --locale mutual exclusion, the value-flag
// parse) needs the built binary — a single module graph, same constraint
// locale.test.ts documents.
const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
describe.runIf(existsSync(CLI))('gs render --locales (built CLI)', () => {
  const written: string[] = [];
  afterAll(() => {
    for (const p of written) rmSync(p, { force: true });
  });
  function plantScene(stem: string, src: string): string {
    const p = join(SCENES, `${stem}.ts`);
    writeFileSync(p, src);
    written.push(p);
    return p;
  }

  // NOTE: messages files live next to the module (the shared SCENES dir), so use
  // locale codes UNIQUE to this file (lx1/lx2) — `locale.test.ts` plants its own
  // `messages.zh.json` in the same dir and the two suites run concurrently, so a
  // shared `zh`/`en` filename would clobber across files.
  it('--locales lx1,lx2 writes both per-locale PNG-sequence subdirs', () => {
    const stem = `_locales-test-${process.pid}`;
    const src = `
import { Text, createScene } from '@glissade/scene';
import { key, timeline, track } from '@glissade/core';
export default {
  createScene: () => createScene({ size: { w: 64, h: 64 }, children: [new Text({ id: 'hero', text: 'BASE', fontSize: 12, fill: '#fff', position: [4, 20] })] }),
  timeline: timeline({ fps: 30, duration: 1, tracks: [track('hero/text', 'string', [key(0, 'BASE', { interp: 'hold' })])] }),
};
`;
    const scene = plantScene(stem, src);
    const en = join(SCENES, 'messages.lx1.json');
    const zh = join(SCENES, 'messages.lx2.json');
    writeFileSync(en, JSON.stringify({ hero: 'EN-HERO' }));
    writeFileSync(zh, JSON.stringify({ hero: '本地英雄' }));
    written.push(en, zh);
    const out = join(mkdtempSync(join(tmpdir(), 'glissade-cli-locales-')), 'frames');
    const res = spawnSync(
      process.execPath,
      [CLI, 'render', scene, '--out', out, '--frame', '0', '--captions', 'off', '--narration', 'off', '--music', 'off', '--sfx', 'off', '--locales', 'lx1,lx2'],
      { encoding: 'utf8' },
    );
    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(join(out, 'lx1'))).toBe(true);
    expect(existsSync(join(out, 'lx2'))).toBe(true);
    // each subdir holds a rendered frame
    expect(readdirSync(join(out, 'lx1')).some((f) => f.endsWith('.png'))).toBe(true);
    expect(readdirSync(join(out, 'lx2')).some((f) => f.endsWith('.png'))).toBe(true);
    rmSync(out, { recursive: true, force: true });
  });

  it('--locale and --locales together is rejected', () => {
    const stem = `_locales-mutex-${process.pid}`;
    const src = `
import { Text, createScene } from '@glissade/scene';
import { key, timeline, track } from '@glissade/core';
export default {
  createScene: () => createScene({ size: { w: 64, h: 64 }, children: [new Text({ id: 'hero', text: 'BASE', fontSize: 12, fill: '#fff', position: [4, 20] })] }),
  timeline: timeline({ fps: 30, duration: 1, tracks: [track('hero/text', 'string', [key(0, 'BASE', { interp: 'hold' })])] }),
};
`;
    const scene = plantScene(stem, src);
    const out = join(mkdtempSync(join(tmpdir(), 'glissade-cli-locales-')), 'frames');
    const res = spawnSync(
      process.execPath,
      [CLI, 'render', scene, '--out', out, '--frame', '0', '--locale', 'en', '--locales', 'en,zh'],
      { encoding: 'utf8' },
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/mutually exclusive/);
  });

  it('a bad locale in --locales fails the whole fan-out, naming it', () => {
    const stem = `_locales-bad-${process.pid}`;
    const src = `
import { Text, createScene } from '@glissade/scene';
import { key, timeline, track } from '@glissade/core';
export default {
  createScene: () => createScene({ size: { w: 64, h: 64 }, children: [new Text({ id: 'hero', text: 'BASE', fontSize: 12, fill: '#fff', position: [4, 20] })] }),
  timeline: timeline({ fps: 30, duration: 1, tracks: [track('hero/text', 'string', [key(0, 'BASE', { interp: 'hold' })])] }),
};
`;
    const scene = plantScene(stem, src);
    const en = join(SCENES, 'messages.lx1.json');
    writeFileSync(en, JSON.stringify({ hero: 'EN-HERO' }));
    written.push(en);
    const out = join(mkdtempSync(join(tmpdir(), 'glissade-cli-locales-')), 'frames');
    const res = spawnSync(
      process.execPath,
      [CLI, 'render', scene, '--out', out, '--frame', '0', '--captions', 'off', '--narration', 'off', '--music', 'off', '--sfx', 'off', '--locales', 'lx1,zz-nope'],
      { encoding: 'utf8' },
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('zz-nope');
    rmSync(out, { recursive: true, force: true });
  });
});

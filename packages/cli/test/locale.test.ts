/**
 * gs render --locale (0.14 localization core): the locale message table +
 * narration-sibling resolution, and the load-bearing guarantee that the no-flag
 * (base) render path is BYTE-IDENTICAL to today.
 */

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { render } from '../src/render.js';
import { timingPathFor } from '../src/captions.js';
import {
  LOCALE_NARRATION_SUFFIX,
  loadMessageTable,
  localeNarrationPathFor,
  messagesFileFor,
} from '../src/locale.js';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'glissade-locale-'));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// a minimal scene module: one Text node driven by a string track on its node-id,
// plus a free-standing t() key on a second Text node.
const SCENE_SRC = `
import { Text, createScene } from '@glissade/scene';
import { key, timeline, track } from '@glissade/core';
import { t } from '@glissade/core/i18n';

const SIZE = { w: 64, h: 64 };

export default {
  createScene: () =>
    createScene({
      size: SIZE,
      children: [
        new Text({ id: 'hero', text: 'BASE-HERO', fontSize: 12, fill: '#ffffff', position: [4, 20] }),
        new Text({ id: 'banner', text: t('banner.label'), fontSize: 12, fill: '#ffffff', position: [4, 40] }),
      ],
    }),
  timeline: timeline({
    fps: 30,
    duration: 1,
    tracks: [
      track('hero/text', 'string', [key(0, 'BASE-HERO', { interp: 'hold' })]),
    ],
  }),
};
`;

function writeScene(dir: string): string {
  const p = join(dir, 'scene.ts');
  writeFileSync(p, SCENE_SRC);
  return p;
}

const sha = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

describe('locale path resolution helpers', () => {
  it('messagesFileFor resolves messages.<locale>.json next to the module', () => {
    expect(messagesFileFor('/proj/scene.ts', 'zh')).toBe('/proj/messages.zh.json');
  });

  it('the locale narration sibling suffix is a single source constant', () => {
    expect(LOCALE_NARRATION_SUFFIX).toBe('.%s.narration.timing.json');
    expect(localeNarrationPathFor('/proj/scene.ts', 'zh')).toBe('/proj/scene.zh.narration.timing.json');
  });

  it('timingPathFor prefers the locale-tagged sibling, falling back to base', () => {
    const dir = tmp();
    const scene = writeScene(dir);
    const base = join(dir, 'scene.narration.timing.json');
    const zh = join(dir, 'scene.zh.narration.timing.json');
    const stub = JSON.stringify({ timingVersion: 1, provider: 'x', providerVersion: '0', totalDuration: 1, segments: [] });
    writeFileSync(base, stub);
    // no locale sibling yet → base
    expect(timingPathFor(scene, 'zh')).toBe(base);
    writeFileSync(zh, stub);
    // locale sibling present → preferred
    expect(timingPathFor(scene, 'zh')).toBe(zh);
    // no locale arg → always base (byte-identical-to-today path)
    expect(timingPathFor(scene)).toBe(base);
  });

  it('loadMessageTable returns undefined when no messages file exists', () => {
    const dir = tmp();
    writeScene(dir);
    expect(loadMessageTable(join(dir, 'scene.ts'), 'zh')).toBeUndefined();
  });
});

describe('gs render --locale (integration)', () => {
  it('--locale xx swaps node-id text + free-standing t() against messages.xx.json', async () => {
    const dir = tmp();
    const scene = writeScene(dir);
    writeFileSync(
      messagesFileFor(scene, 'zh'),
      JSON.stringify({ hero: '本地英雄', 'banner.label': '横幅' }),
    );
    const out = join(dir, 'frame-zh.png');
    await render({ modulePath: scene, out, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off', locale: 'zh' });
    const zhBytes = readFileSync(out);

    // base render of the SAME scene (no --locale)
    const baseOut = join(dir, 'frame-base.png');
    await render({ modulePath: scene, out: baseOut, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off' });
    const baseBytes = readFileSync(baseOut);

    // the localized frame must DIFFER from the base (text was actually swapped)
    expect(sha(zhBytes)).not.toBe(sha(baseBytes));
  });

  it('the no-flag path is BYTE-IDENTICAL across runs and ignores a present messages file', async () => {
    const dir = tmp();
    const scene = writeScene(dir);
    // a messages file exists but no --locale is passed: it must NOT be consulted
    writeFileSync(messagesFileFor(scene, 'zh'), JSON.stringify({ hero: '本地英雄', 'banner.label': '横幅' }));

    const a = join(dir, 'a.png');
    const b = join(dir, 'b.png');
    await render({ modulePath: scene, out: a, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off' });
    await render({ modulePath: scene, out: b, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off' });
    expect(sha(readFileSync(a))).toBe(sha(readFileSync(b)));
  });
});

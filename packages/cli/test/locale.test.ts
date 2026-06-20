/**
 * gs render --locale (0.14 localization core): the locale message table +
 * narration-sibling resolution, and the load-bearing guarantee that the no-flag
 * (base) render path is BYTE-IDENTICAL to today.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { render } from '../src/render.js';
import { timingPathFor } from '../src/captions.js';
import {
  LOCALE_NARRATION_SUFFIX,
  UnknownLocaleError,
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
  it('--locale xx swaps node-id text against messages.xx.json', async () => {
    // NOTE: in-process only the node-id key is used. The free-standing `t()`
    // key is exercised in the built-CLI block below — under vitest the scene
    // module loads via jiti (the DIST core instance), a SEPARATE ambient table /
    // consumed-id set from this test's SRC-aliased core, so a t()-only table key
    // would (correctly, per FIX 5) read as orphaned in-process. The production
    // CLI has a single module graph, so t() + the orphan check agree (tested via
    // the real binary below).
    const dir = tmp();
    const scene = writeScene(dir);
    writeFileSync(messagesFileFor(scene, 'zh'), JSON.stringify({ hero: '本地英雄' }));
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

  it('FIX 5: an orphaned messages key (no node-id, no t() id) throws in-process', async () => {
    const dir = tmp();
    const scene = writeScene(dir);
    // 'hero' matches a node-id; 'totally.stale' matches neither a node-id nor a
    // t() id consumed in THIS process → the orphan guard fires.
    writeFileSync(messagesFileFor(scene, 'zh'), JSON.stringify({ hero: '本地英雄', 'totally.stale': 'X' }));
    const out = join(dir, 'frame-orphan.png');
    await expect(
      render({ modulePath: scene, out, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off', locale: 'zh' }),
    ).rejects.toThrow(/totally\.stale/);
  });

  it('FIX 4: --locale with NEITHER a messages file NOR a narration sibling throws UnknownLocaleError', async () => {
    const dir = tmp();
    const scene = writeScene(dir);
    // no messages.xx.json and no scene.xx.narration.timing.json → unresolvable locale
    const out = join(dir, 'frame-xx.png');
    await expect(
      render({ modulePath: scene, out, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off', locale: 'xx' }),
    ).rejects.toThrow(UnknownLocaleError);
  });

  it('FIX 4: a narration-only locale (sibling present, no messages file) still renders', async () => {
    const dir = tmp();
    const scene = writeScene(dir);
    // only the locale-tagged narration sibling exists — legitimate, must NOT throw
    const stub = JSON.stringify({ timingVersion: 1, provider: 'x', providerVersion: '0', totalDuration: 1, segments: [] });
    writeFileSync(localeNarrationPathFor(scene, 'xx'), stub);
    const out = join(dir, 'frame-narr.png');
    await expect(
      render({ modulePath: scene, out, frame: 0, captions: 'off', narration: 'off', music: 'off', sfx: 'off', locale: 'xx' }),
    ).resolves.toBeDefined();
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

// The full t() + node-id swap (and the FIX 5 orphan check agreeing WITH t())
// needs a single module graph — under vitest, jiti loads the scene module in the
// DIST core instance while this test runs in the SRC-aliased one, so the ambient
// table + consumed-id set don't cross (same constraint fonts.test.ts documents).
// The production CLI has one graph, so we exercise it through the real binary.
const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
describe.runIf(existsSync(CLI))('gs render --locale (built CLI — single module graph)', () => {
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

  it('FIX 5: t() id + node-id keys both resolve and the orphan check passes (no false orphan)', () => {
    const stem = `_locale-test-${process.pid}`;
    const src = `
import { Text, createScene } from '@glissade/scene';
import { key, timeline, track } from '@glissade/core';
import { t } from '@glissade/core/i18n';
export default {
  createScene: () => createScene({
    size: { w: 64, h: 64 },
    children: [
      new Text({ id: 'hero', text: 'BASE-HERO', fontSize: 12, fill: '#fff', position: [4, 20] }),
      new Text({ id: 'banner', text: t('banner.label'), fontSize: 12, fill: '#fff', position: [4, 40] }),
    ],
  }),
  timeline: timeline({ fps: 30, duration: 1, tracks: [track('hero/text', 'string', [key(0, 'BASE-HERO', { interp: 'hold' })])] }),
};
`;
    const scene = plantScene(stem, src);
    // both a node-id key (hero) AND a free-standing t() key (banner.label) —
    // neither is orphaned, so --strict-free render exits 0.
    const msgs = join(SCENES, `messages.zh.json`);
    writeFileSync(msgs, JSON.stringify({ hero: '本地英雄', 'banner.label': '横幅' }));
    written.push(msgs);
    const out = join(mkdtempSync(join(tmpdir(), 'glissade-cli-loc-')), 'f.png');
    const res = spawnSync(process.execPath, [CLI, 'render', scene, '--out', out, '--frame', '0', '--captions', 'off', '--narration', 'off', '--music', 'off', '--sfx', 'off', '--locale', 'zh'], { encoding: 'utf8' });
    expect(res.status).toBe(0);
  });

  it('FIX 5: an orphaned key (no node-id, no t() id) FAILS the build through the real binary', () => {
    const stem = `_locale-test-orphan-${process.pid}`;
    const src = `
import { Text, createScene } from '@glissade/scene';
import { key, timeline, track } from '@glissade/core';
export default {
  createScene: () => createScene({ size: { w: 64, h: 64 }, children: [new Text({ id: 'hero', text: 'BASE', fontSize: 12, fill: '#fff', position: [4, 20] })] }),
  timeline: timeline({ fps: 30, duration: 1, tracks: [track('hero/text', 'string', [key(0, 'BASE', { interp: 'hold' })])] }),
};
`;
    const scene = plantScene(stem, src);
    const msgs = join(SCENES, `messages.zh.json`);
    writeFileSync(msgs, JSON.stringify({ hero: '本地英雄', 'stale.key': 'X' }));
    written.push(msgs);
    const out = join(mkdtempSync(join(tmpdir(), 'glissade-cli-loc-')), 'f.png');
    const res = spawnSync(process.execPath, [CLI, 'render', scene, '--out', out, '--frame', '0', '--captions', 'off', '--narration', 'off', '--music', 'off', '--sfx', 'off', '--locale', 'zh'], { encoding: 'utf8' });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('stale.key');
  });
});

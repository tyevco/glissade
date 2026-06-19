/**
 * gs fonts audit (DESIGN.md §3.6) — the font front-door report. Loads a scene
 * module, ingests each declared face through the REAL front door
 * (@glissade/core/font-ingest), and reports per family the declared faces, the
 * sniffed on-disk format, the cmap coverage size, and any missing-glyph RUNS for
 * the text the scene actually renders.
 *
 * Driven through the SAME entry point the CLI calls (`fontsAuditCommand`), with
 * the committed Inconsolata instance fixture from the golden corpus.
 */

import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { auditSceneFonts, formatFontAudit, fontsAuditCommand } from '../src/fonts.js';
import { resolveAssetPath } from '../src/audioMix.js';

const INSTANCED_MODULE = fileURLToPath(
  new URL('../../examples/src/scenes/golden-font-instanced.ts', import.meta.url),
);

// The missing-glyph integration runs through the BUILT cli binary (a real child
// process), because the audit loads scene modules via jiti — under vitest's src
// aliases that resolves a SECOND @glissade/scene instance, so `node instanceof
// Text` (how collectTextUsages walks the tree) is false. The production CLI has a
// single module graph, so it works; we exercise that real path here. A throwaway
// module lives in the examples scenes dir so its asset url resolves like a golden.
const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const MISSING_MODULE = fileURLToPath(
  new URL('../../examples/src/scenes/_fonts-test-missing.ts', import.meta.url),
);
afterAll(() => rmSync(MISSING_MODULE, { force: true }));

const resolveFor = (modulePath: string) => (url: string) => resolveAssetPath(url, modulePath);

describe('gs fonts audit — instanced variable face', () => {
  it('reports the family, sniffed format, and coverage of the committed static instance', async () => {
    const report = await auditSceneFonts(INSTANCED_MODULE, resolveFor(INSTANCED_MODULE));
    expect(report.families.map((f) => f.family)).toEqual(['Inconsolata Semibold']);
    const fam = report.families[0]!;
    expect(fam.faces).toHaveLength(1);
    const face = fam.faces[0]!;
    // the committed Inconsolata-wght600.ttf is a plain static sfnt now.
    expect(face.format).toBe('truetype');
    expect(face.coverage).toBeGreaterThan(200);
    // every glyph the scene renders is covered → no missing runs.
    expect(fam.missingRuns).toEqual([]);
  });

  it('formats a human-readable report with the family + a glyph count', () => {
    const text = formatFontAudit({
      families: [
        {
          family: 'Inconsolata Semibold',
          faces: [
            { family: 'Inconsolata Semibold', url: 'x.ttf', weight: 600, style: 'normal', format: 'truetype', coverage: 882 },
          ],
          missingRuns: [],
        },
      ],
    });
    expect(text).toContain('Inconsolata Semibold');
    expect(text).toContain('882 glyphs');
    expect(text).toContain('truetype');
    expect(text).not.toContain('missing glyphs');
  });

  it('the command entry returns matching report + text', async () => {
    const { report, text } = await fontsAuditCommand({
      modulePath: INSTANCED_MODULE,
      resolvePath: resolveFor(INSTANCED_MODULE),
    });
    expect(report.families).toHaveLength(1);
    expect(text).toContain('Inconsolata Semibold');
  });
});

describe.runIf(existsSync(CLI))('gs fonts audit — missing-glyph runs (built CLI)', () => {
  it('flags code points used by Text that no face in the family covers', () => {
    // a scene that renders an emoji + CJK in the monospace Latin instance → tofu.
    // the font url is relative to the scenes dir (where this module is written),
    // matching how the real golden scenes reference their assets.
    const mod = `
      import { timeline } from '@glissade/core';
      import { Text, createScene } from '@glissade/scene';
      const FAMILY = 'Inconsolata Semibold';
      export default {
        createScene: () => createScene({
          size: { w: 320, h: 120 },
          children: [
            new Text({ id: 't', text: 'hi 👋 漢', fill: '#fff', fontFamily: FAMILY, fontSize: 20, position: [10, 60] }),
          ],
        }),
        timeline: timeline(() => {}, {
          fps: 60, duration: 1,
          assets: { 'Inconsolata Semibold': { kind: 'font', url: '../../assets/fonts/Inconsolata-wght600.ttf' } },
        }),
      };
    `;
    writeFileSync(MISSING_MODULE, mod);

    const res = spawnSync(process.execPath, [CLI, 'fonts', 'audit', MISSING_MODULE], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    const out = res.stdout;
    expect(out).toContain('Inconsolata Semibold');
    expect(out).toContain('truetype');
    // the missing-glyph RUN line names the uncovered code points as U+ hex.
    expect(out).toContain('missing glyphs');
    expect(out).toContain('U+1F44B'); // 👋
    expect(out).toContain('U+6F22'); // 漢
    // covered ASCII ('h') is NOT reported as missing.
    expect(out).not.toContain('U+0068');
  });
});

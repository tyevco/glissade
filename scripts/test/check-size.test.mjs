/**
 * 0.13 CI gate hardening — regression guard for scripts/check-size.mjs's
 * font-ingest leak guard.
 *
 * The metafile-input check is blind to a STATIC `@glissade/core/font-ingest`
 * subpath import in an embed package: esbuild externalizes `@glissade/*`, so the
 * subpath specifier is never bundled and never appears as a metafile input. The
 * companion `findStaticFontIngestImports(distDir)` scans built dist directly and
 * FAILs on any static specifier — the sanctioned reach is a dynamic `import()`
 * only.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { findStaticFontIngestImports } = await import(join(here, '..', 'check-size.mjs'));

const tmps = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Make a fake dist dir containing a single index.js with the given source. */
function distWith(source) {
  const dir = mkdtempSync(join(tmpdir(), 'check-size-'));
  tmps.push(dir);
  writeFileSync(join(dir, 'index.js'), source);
  return dir;
}

describe('check-size font-ingest static-import scan', () => {
  it('PLANTED: a static `from \'@glissade/core/font-ingest\'` in embed dist is caught', () => {
    const dist = distWith(`import { ingestFont } from '@glissade/core/font-ingest';\nexport const x = ingestFont;\n`);
    const hits = findStaticFontIngestImports(dist);
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(1);
  });

  it('also catches a bare side-effect static import', () => {
    const dist = distWith(`import '@glissade/core/font-ingest';\n`);
    expect(findStaticFontIngestImports(dist)).toHaveLength(1);
  });

  it('also catches a re-export `export … from`', () => {
    const dist = distWith(`export { ingestFont } from '@glissade/core/font-ingest';\n`);
    expect(findStaticFontIngestImports(dist)).toHaveLength(1);
  });

  it('ALLOWS the sanctioned dynamic import() (the lazy, export-only path)', () => {
    const dist = distWith(`export async function load() {\n  return import('@glissade/core/font-ingest');\n}\n`);
    expect(findStaticFontIngestImports(dist)).toEqual([]);
  });

  it('does not false-positive on a dynamic import with whitespace inside the call', () => {
    const dist = distWith(`const m = await import(\n  '@glissade/core/font-ingest'\n);\n`);
    expect(findStaticFontIngestImports(dist)).toEqual([]);
  });

  it('ignores unrelated @glissade/core imports', () => {
    const dist = distWith(`import { evaluate } from '@glissade/core';\nimport { x } from '@glissade/core/clips';\n`);
    expect(findStaticFontIngestImports(dist)).toEqual([]);
  });

  it('returns clean for a missing dist dir (unbuilt package)', () => {
    expect(findStaticFontIngestImports(join(tmpdir(), 'does-not-exist-check-size'))).toEqual([]);
  });
});

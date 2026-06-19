/**
 * 0.13 CI gate hardening — regression guard for scripts/check-deps.mjs.
 *
 * The §7.1 import matcher previously anchored a closing quote right after the
 * package name, so a SUBPATH specifier (`@glissade/core/clips`,
 * `@glissade/core/font-ingest`) slipped past the direction check entirely — a
 * wrong-direction subpath import was INVISIBLE. The broadened matcher captures
 * the base package name across an optional `/subpath`, so it is now caught
 * exactly like a bare specifier.
 *
 * Strategy: build a tiny `packages`-shaped fixture tree on disk and run the
 * exported `findViolations(root)` over it, plus drive the real script binary to
 * confirm a non-zero exit. The planted violation is a wrong-direction SUBPATH
 * import that the OLD regex would have missed.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '..', 'check-deps.mjs');
const { findViolations } = await import(scriptPath);

const tmps = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Make a `packages`-shaped fixture: { pkg: { 'file.ts': source } }. */
function fixture(tree) {
  const dir = mkdtempSync(join(tmpdir(), 'check-deps-'));
  tmps.push(dir);
  for (const [pkg, files] of Object.entries(tree)) {
    const src = join(dir, pkg, 'src');
    mkdirSync(src, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(src, name), content);
    }
  }
  return dir;
}

describe('check-deps §7.1 subpath matcher', () => {
  it('PLANTED: a wrong-direction SUBPATH import is now caught (was invisible to the old regex)', () => {
    // core may depend on NOTHING; importing scene's subpath is wrong-direction.
    const root = fixture({
      core: { 'a.ts': `import { x } from '@glissade/scene/layout';\n` },
    });
    const v = findViolations(root);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ pkg: 'core', dep: 'scene', reason: 'direction' });
  });

  it('PLANTED: a wrong-direction MULTI-LINE import is now caught (was invisible — the body excluded \\n)', () => {
    // The dominant import style spans newlines between `import {` and `from`.
    const root = fixture({
      core: {
        'a.ts': `import {\n  Player,\n  mount,\n} from '@glissade/player';\n`,
      },
    });
    const v = findViolations(root);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ pkg: 'core', dep: 'player', reason: 'direction' });
  });

  it('ALLOWS a legal MULTI-LINE subpath import (scene → core/clips) — no false positive', () => {
    const root = fixture({
      scene: {
        'a.ts': `import {\n  clip,\n  popIn,\n} from '@glissade/core/clips';\n`,
      },
    });
    expect(findViolations(root)).toEqual([]);
  });

  it('also catches a wrong-direction dynamic import() of a subpath', () => {
    const root = fixture({
      core: { 'a.ts': `const m = await import('@glissade/scene/layout/deep');\n` },
    });
    const v = findViolations(root);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ pkg: 'core', dep: 'scene', reason: 'direction' });
  });

  it('still catches a wrong-direction BARE import (no regression)', () => {
    const root = fixture({
      scene: { 'a.ts': `import { Player } from '@glissade/player';\n` },
    });
    const v = findViolations(root);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ pkg: 'scene', dep: 'player', reason: 'direction' });
  });

  it('ALLOWS a legal subpath import (scene → core/clips) — no false positive', () => {
    const root = fixture({
      scene: { 'a.ts': `import { clip } from '@glissade/core/clips';\nimport { x } from '@glissade/core';\n` },
    });
    expect(findViolations(root)).toEqual([]);
  });

  it('does NOT false-positive on a `from \'@glissade/x/sub\'` inside a STRING or COMMENT', () => {
    // The broadened subpath matcher must still ignore a spec that merely appears
    // in a user-facing error message or a doc comment (scene's real
    // LayoutEngineMissingError shape) — only statement-leading imports count.
    const root = fixture({
      core: {
        'a.ts': [
          `// see await loadYogaLayoutEngine() from '@glissade/scene/layout' before use`,
          `/* also from '@glissade/player' in a block comment */`,
          `export const msg = "call from '@glissade/scene/layout' first";`,
        ].join('\n'),
      },
    });
    expect(findViolations(root)).toEqual([]);
  });

  it('the real script exits non-zero on the planted subpath violation', () => {
    const root = fixture({
      core: { 'a.ts': `import { x } from '@glissade/scene/layout';\n` },
    });
    // Drive the script's exported scanner the same way its CLI entrypoint does
    // (it `process.exit(1)`s on any violation) — but point it at the fixture
    // root rather than the real monorepo, via a tiny inline shim.
    const shimDir = mkdtempSync(join(tmpdir(), 'check-deps-shim-'));
    tmps.push(shimDir);
    const shim = join(shimDir, 'shim.mjs');
    writeFileSync(
      shim,
      `import { findViolations } from ${JSON.stringify(scriptPath)};\n` +
        `process.exit(findViolations(${JSON.stringify(root)}).length > 0 ? 1 : 0);\n`,
    );
    const r = spawnSync(process.execPath, [shim], { encoding: 'utf8' });
    expect(r.status).toBe(1);
  });
});

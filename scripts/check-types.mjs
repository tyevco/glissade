/**
 * are-the-types-wrong gate (DESIGN.md §7): every published package must resolve
 * cleanly under the `esm-only` profile (we ship ESM-only — node10 and
 * CJS-require-resolves-to-ESM are expected and ignored by that profile). Fails
 * CI if any package develops a genuine type-resolution problem (wrong `types`
 * path, missing `exports` condition, a `.d.ts` that doesn't parse).
 *
 *   node scripts/check-types.mjs
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const attw = join(root, 'node_modules', '.bin', 'attw');

const packages = readdirSync(join(root, 'packages'))
  .map((name) => join(root, 'packages', name))
  .filter((dir) => existsSync(join(dir, 'package.json')))
  .filter((dir) => {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return pkg.private !== true;
  })
  .sort();

let failed = 0;
for (const dir of packages) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (!existsSync(join(dir, 'dist'))) {
    console.error(`FAIL ${pkg.name}: dist/ missing — run pnpm build first`);
    failed++;
    continue;
  }
  const res = spawnSync(attw, ['--pack', dir, '--profile', 'esm-only'], { encoding: 'utf8' });
  if (res.status === 0) {
    console.log(`ok   ${pkg.name}`);
  } else {
    failed++;
    console.error(`FAIL ${pkg.name}\n${res.stdout || ''}${res.stderr || ''}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} package(s) have type-resolution problems (§7).`);
  process.exit(1);
}
console.log(`\nattw ok — ${packages.length} packages resolve cleanly (esm-only profile).`);

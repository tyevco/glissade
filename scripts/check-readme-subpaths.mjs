/**
 * README coverage guard (0.38, ai-training process ask) — every USER-FACING scene
 * factory subpath (`@glissade/scene/<x>`) must be mentioned in the shipped package
 * README, so an npm-install author who reads the README (not the describe()
 * manifest) has a path to each feature. Converts a recurring miss (0.34/0.35/0.37/
 * 0.38 each shipped a feature whose referenced prose guide wasn't reachable from
 * the install) into a one-time CI gate — the same spirit as the golden-font pin.
 *
 * A NEW feature subpath is auto-required here; a new INFRA subpath is a deliberate
 * addition to SKIP below. The README (which DOES ship in the tarball) is the
 * check target — docs/*.md are VitePress site content and intentionally not
 * packaged, so this asserts the shipped surface, not the site.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Infra / non-feature subpaths that don't need a README prose section. Adding a
// new entry here is a DELIBERATE call that this subpath isn't a user-facing feature.
const SKIP = new Set([
  '.',
  './layout', // Yoga flexbox — documented in the intro sentence's LayoutEngine note
  './layout-ctors',
  './describe',
  './diagnostics',
  './identity',
  './examples',
  './tokens', // production token-highlight; niche, documented in DESIGN
]);

let failed = false;

const pkg = JSON.parse(readFileSync(join(root, 'packages/scene/package.json'), 'utf8'));
const readme = readFileSync(join(root, 'packages/scene/README.md'), 'utf8');

const featureSubpaths = Object.keys(pkg.exports ?? {}).filter((k) => k.startsWith('./') && !SKIP.has(k));
const missing = [];
for (const sub of featureSubpaths) {
  const name = sub.slice(2); // './gauge' -> 'gauge'
  // the README must reference the subpath (e.g. `./gauge` or `/gauge`)
  if (!new RegExp(`/${name}\\b`).test(readme)) missing.push(sub);
}

if (missing.length) {
  failed = true;
  console.error(
    `FAIL @glissade/scene README omits ${missing.length} user-facing subpath(s): ${missing.join(', ')}\n` +
      `     Add a mention (a section or the subpath list) to packages/scene/README.md, or add the subpath to SKIP in scripts/check-readme-subpaths.mjs if it isn't a user-facing feature.`,
  );
} else {
  console.log(`ok   @glissade/scene README covers all ${featureSubpaths.length} user-facing subpaths (${featureSubpaths.map((s) => s.slice(2)).join(', ')})`);
}

process.exit(failed ? 1 : 0);

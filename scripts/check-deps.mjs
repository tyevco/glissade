/**
 * Dependency-direction lint (DESIGN.md §7.1), enforced in CI:
 * core ← scene ← backends ← player ← element/react/vite-plugin/studio/cli;
 * nothing imports "up". Scans @glissade/* import specifiers in each
 * package's src — the boundary is the package graph, not discipline.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../packages', import.meta.url));

/** Allowed @glissade/* dependencies per package (§7.1). */
const ALLOWED = {
  core: [],
  scene: ['core'],
  'backend-canvas2d': ['core', 'scene'],
  'backend-skia': ['core', 'scene'],
  player: ['core', 'scene', 'backend-canvas2d'],
  element: ['core', 'scene', 'backend-canvas2d', 'player'],
  react: ['core', 'scene', 'backend-canvas2d', 'player'],
  'vite-plugin': ['core'],
  'export-web': ['core', 'scene', 'backend-canvas2d'],
  // §C.6: the interactivity layer is opt-in — nothing in the linear pipeline may import it
  interact: ['core'],
  cli: ['core', 'scene', 'backend-skia'],
  studio: ['core', 'scene', 'backend-canvas2d', 'player', 'react', 'vite-plugin'],
  examples: null, // leaf consumer: anything goes
};

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.(ts|tsx)$/.test(entry)) yield p;
  }
}

let failed = false;
for (const pkg of readdirSync(root)) {
  const allowed = ALLOWED[pkg];
  if (allowed === null || allowed === undefined) {
    if (allowed === undefined && pkg in ALLOWED === false && statSync(join(root, pkg)).isDirectory()) {
      console.error(`FAIL ${pkg}: not in the §7.1 dependency map — add it to scripts/check-deps.mjs`);
      failed = true;
    }
    continue;
  }
  const srcDir = join(root, pkg, 'src');
  let files;
  try {
    files = [...sourceFiles(srcDir)];
  } catch {
    continue;
  }
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from\s+['"]@glissade\/([\w-]+)['"]|import\(['"]@glissade\/([\w-]+)['"]\)/g)) {
      const dep = m[1] ?? m[2];
      if (!allowed.includes(dep)) {
        console.error(`FAIL ${pkg} → @glissade/${dep} (${file.slice(root.length)}) violates §7.1`);
        failed = true;
      }
    }
  }
}

if (!failed) console.log('ok   dependency direction (§7.1) holds across all packages');
process.exit(failed ? 1 : 0);

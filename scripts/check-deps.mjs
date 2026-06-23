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
  // §3.4 / dom-backend memo: a peer backend (preview/non-parity DOM tier). Like
  // the other backends it may import only core+scene; player does NOT depend on
  // it (DOM is caller-injected via mount({ backend }), never a static player dep).
  'backend-dom': ['core', 'scene'],
  'backend-skia': ['core', 'scene'],
  player: ['core', 'scene', 'backend-canvas2d'],
  element: ['core', 'scene', 'backend-canvas2d', 'player'],
  react: ['core', 'scene', 'backend-canvas2d', 'player'],
  'vite-plugin': ['core'],
  'export-web': ['core', 'scene', 'backend-canvas2d'],
  // §3.7: browser-only shader runner — cli/backend-skia must NEVER appear in its dependents
  'effects-webgpu': ['core', 'scene', 'backend-canvas2d'],
  narrate: ['core', 'scene'],
  sfx: ['core', 'scene'],
  // §C.6: the interactivity layer is opt-in — nothing in the linear pipeline may import it
  interact: ['core', 'scene', 'player'],
  lottie: ['core', 'scene'],
  svg: ['core', 'scene'],
  // §7.2: the unscoped `glissade` umbrella (dir `umbrella`, package name `glissade`)
  // — the one-import embed surface. It re-exports ONLY core+scene+player; nothing
  // heavier (backend-skia/cli/studio/export-web) may appear or the embed
  // import-direction promise breaks.
  umbrella: ['core', 'scene', 'player'],
  browser: ['core', 'scene', 'backend-canvas2d', 'player', 'element'], // §4.4 prebuilt IIFE bundle, leaf consumer
  'eslint-plugin': [], // standalone dev tool: imports no @glissade packages

  cli: ['core', 'scene', 'backend-skia', 'interact', 'player', 'lottie', 'svg', 'narrate', 'sfx'], // interact/player: machine replay + the gs dev harness; lottie/svg: gs import
  studio: ['core', 'scene', 'backend-canvas2d', 'player', 'react', 'vite-plugin', 'export-web'],
  examples: null, // leaf consumer: anything goes
};

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.(ts|tsx)$/.test(entry)) yield p;
  }
}

/**
 * Strip line/block COMMENTS only (string literals are kept intact — real import
 * specifiers live in strings). Erases comment bodies to newlines/spaces so a
 * `@glissade/<pkg>/<sub>` mention inside a doc comment can't false-positive.
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i++;
    } else if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      out += c;
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += src[i];
        i++;
      }
      out += src[i] ?? '';
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/**
 * Matches `@glissade/<pkg>` specifiers in REAL module constructs, capturing the
 * BASE package name while tolerating an optional `/subpath` (e.g.
 * `@glissade/core/clips`, `@glissade/core/font-ingest`). The direction check
 * resolves against the base name, so a wrong-direction SUBPATH import is caught
 * exactly like a bare one — the older `['"]`-anchored regex was blind to
 * subpath imports.
 *
 * The `from` branch is anchored to a STATEMENT-LEADING `import`/`export` (after
 * line-start whitespace) so a `from '@glissade/x/sub'` that merely appears
 * inside a user-facing string (e.g. scene's LayoutEngineMissingError message)
 * is NOT mistaken for an import. The `import()` branch is the dynamic form.
 *
 * The `from` branch's `[^;'"]*?` body deliberately does NOT exclude `\n`: a
 * MULTI-LINE `import {\n  …\n} from '@glissade/x'` (the dominant style) spans
 * newlines between `import` and `from`, so excluding `\n` made every multi-line
 * import INVISIBLE to the direction/embed gate. The lazy quantifier + the
 * statement-leading anchor keep it from over-matching across a `;`-or-quote
 * boundary, so a stray `from '@glissade/...'` in a string still can't match.
 */
const IMPORT_RE =
  /^[ \t]*(?:import|export)\b[^;'"]*?\bfrom\s+['"]@glissade\/([\w-]+)(?:\/[\w./-]+)?['"]|(?:^[ \t]*import|[ \t]import)\s+['"]@glissade\/([\w-]+)(?:\/[\w./-]+)?['"]|import\(\s*['"]@glissade\/([\w-]+)(?:\/[\w./-]+)?['"]\s*\)/gm;

/**
 * Scan `<root>/<pkg>/src` for §7.1 dependency-direction violations. Pure over
 * the filesystem at `root` (a `packages`-shaped dir), so a fixture tree can be
 * passed in by the regression test. Returns the list of violations (empty =
 * clean) plus any package missing from the §7.1 map.
 */
export function findViolations(root) {
  const violations = [];
  for (const pkg of readdirSync(root)) {
    const allowed = ALLOWED[pkg];
    if (allowed === null || allowed === undefined) {
      if (allowed === undefined && pkg in ALLOWED === false && statSync(join(root, pkg)).isDirectory()) {
        violations.push({ pkg, dep: null, file: null, reason: 'unmapped' });
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
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(IMPORT_RE)) {
        const dep = m[1] ?? m[2] ?? m[3];
        if (!allowed.includes(dep)) {
          violations.push({ pkg, dep, file: file.slice(root.length), reason: 'direction' });
        }
      }
    }
  }
  return violations;
}

// Run as a CLI when invoked directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = findViolations(root);
  for (const v of violations) {
    if (v.reason === 'unmapped') {
      console.error(`FAIL ${v.pkg}: not in the §7.1 dependency map — add it to scripts/check-deps.mjs`);
    } else {
      console.error(`FAIL ${v.pkg} → @glissade/${v.dep} (${v.file}) violates §7.1`);
    }
  }
  if (violations.length === 0) console.log('ok   dependency direction (§7.1) holds across all packages');
  process.exit(violations.length > 0 ? 1 : 0);
}

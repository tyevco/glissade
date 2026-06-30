#!/usr/bin/env node
/**
 * Generate `docs/api-reference.md` from the LIVE `describe()` manifest — the
 * single source of truth, so the human-facing API reference can NEVER drift from
 * the code (§0.24, card 3A6wTkX8Z6m-). The manifest is generated from the real
 * registries; the examples are the SAME snippets the doctest harness runs (Slice
 * A), so a reference example can't rot either.
 *
 *   pnpm docs:api          → (re)write docs/api-reference.md
 *   pnpm check:docs-api    → --check: fail if the committed file is stale
 *
 * Mirrors the api-extractor `api:update` / `check:api` pattern, for the docs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Load the built dist directly (the pnpm workspace doesn't symlink @glissade/* at
// the repo root; the dist's own node_modules resolves its @glissade/core import).
import { describe } from '../packages/scene/dist/describe.js';
import '../packages/scene/dist/examples.js'; // side-effect: register the runnable corpus

const OUT = fileURLToPath(new URL('../docs/api-reference.md', import.meta.url));
const CHECK = process.argv.includes('--check');

const code = (snippets) => (snippets ?? []).map((s) => '```ts\n' + s + '\n```').join('\n\n');
const esc = (s) => String(s).replace(/\|/g, '\\|');

function buildMarkdown(m) {
  const out = [];
  out.push('# API reference');
  out.push('');
  out.push(
    '> **Generated** from the live `describe()` manifest — do not edit by hand (run `pnpm docs:api`). ' +
      'Your INSTALLED version is the source of truth: call `glissade.describe()` (or `describe()` from `@glissade/scene/describe`) for the machine-readable form at your version, ' +
      "and `describe({ examples: true })` after `import '@glissade/scene/examples'` for the runnable snippets below. " +
      'Every snippet here is executed by the doctest harness in CI, so it cannot drift from the API.',
  );
  out.push('');

  // ---- Nodes ----
  out.push('## Nodes');
  out.push('');
  out.push('Each node lists its props: **animatable** props carry a track `target` (`<id>/<path>`); the rest are construction-only.');
  out.push('');
  for (const [name, node] of Object.entries(m.nodes)) {
    out.push(`### ${name}`);
    out.push('');
    if (node.subpath) out.push(`Import from \`${node.subpath}\`. Default \`position\` anchor: \`${node.positionAnchor}\`.`);
    else out.push(`Default \`position\` anchor: \`${node.positionAnchor}\`.`);
    out.push('');
    out.push('| Prop | Type | Animatable | Track target |');
    out.push('| --- | --- | --- | --- |');
    for (const [prop, p] of Object.entries(node.props)) {
      out.push(`| \`${prop}\`${p.required ? ' *(required)*' : ''} | \`${esc(p.type)}\` | ${p.animatable ? 'yes' : 'no'} | ${p.target ? `\`${esc(p.target)}\`` : '—'} |`);
    }
    out.push('');
    if (node.examples?.length) {
      out.push(code(node.examples));
      out.push('');
    }
  }

  // ---- Timeline builder ----
  out.push('## Timeline builder');
  out.push('');
  out.push('Methods on the `timeline(tl => …)` builder (and the object form). See [Composing timelines](./timeline) for the mental model.');
  out.push('');
  for (const method of m.builder.methods) {
    out.push(`### \`${method.name}\``);
    out.push('');
    out.push('```ts');
    out.push(method.signature);
    out.push('```');
    out.push('');
    if (method.examples?.length) {
      out.push(code(method.examples));
      out.push('');
    }
  }

  // ---- Helpers ----
  out.push('## Helpers');
  out.push('');
  out.push('Free functions beyond the node taxonomy — transport, motion-path, clips, snapshot, text-splitting. On the IIFE each is `window.glissade.<name>`.');
  out.push('');
  for (const h of m.helpers) {
    out.push(`### \`${h.name}\``);
    out.push('');
    out.push(`${h.summary}`);
    out.push('');
    out.push(`Import from \`${h.import}\`.`);
    out.push('');
    out.push('```ts');
    out.push(h.usage);
    out.push('```');
    out.push('');
    if (h.examples?.length) {
      out.push(code(h.examples));
      out.push('');
    }
  }

  // ---- createScene ----
  out.push('## createScene');
  out.push('');
  out.push('```ts');
  out.push(m.createScene);
  out.push('```');
  out.push('');

  // ---- Value types & easings ----
  out.push('## Value types');
  out.push('');
  out.push('Registered interpolation types a track may declare (the 2nd arg to `track(target, type, keys)`):');
  out.push('');
  out.push(m.valueTypes.map((v) => `\`${v}\``).join(' · '));
  out.push('');
  out.push('## Easings');
  out.push('');
  out.push('Easing functions for `to(…, { ease: easings.<name> })` (functions, not string names):');
  out.push('');
  out.push(m.easings.map((e) => `\`${e}\``).join(' · '));
  out.push('');

  // ---- Subpaths ----
  out.push('## Tree-shakeable subpaths');
  out.push('');
  out.push('| Subpath | Contents |');
  out.push('| --- | --- |');
  for (const [entry, desc] of Object.entries(m.subpaths)) {
    out.push(`| \`${entry}\` | ${esc(desc)} |`);
  }
  out.push('');

  return out.join('\n');
}

const md = buildMarkdown(describe({ examples: true }));

if (CHECK) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    /* missing → stale */
  }
  if (current !== md) {
    console.error('FAIL docs/api-reference.md is STALE — run `pnpm docs:api` and commit the result.');
    process.exit(1);
  }
  console.log('ok   docs/api-reference.md is up to date');
} else {
  writeFileSync(OUT, md);
  console.log(`ok   wrote docs/api-reference.md (${md.length} bytes)`);
}

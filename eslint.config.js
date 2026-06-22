// Determinism lint (DESIGN.md §5.5): the @glissade/eslint-plugin rules applied
// to the pure evaluation substrate (core + scene src). The Yoga layout loader
// is the one sanctioned async seam (§3.2, wasm load — outside evaluate()), so
// it is excluded from the no-async rule (0.20: the loader moved from layout.ts
// to layoutEngineYoga.ts when the Yoga-free ctors split off onto layoutCtors.ts);
// the §3.6 font-validation bridge
// (fontUsage.ts) is the other — it loads font cmap bytes via the caller's I/O,
// strictly outside evaluate(). The §3.6 font INGEST front door (fontIngest.ts)
// is the third — it awaits the woff2-decoder / hb-subset instancer wasm at
// ingest/prepare time, an explicitly export-path-only module never reached from
// evaluate() (and tree-shaken out of the embed; see scripts/check-size.mjs).
// The 0.14 localization core (i18n.ts) is the fourth — a build/prepare-time
// doc→doc resolver + t() ambient-table sugar that never runs in evaluate(); 0.15
// FIX 3 lazily awaits `node:async_hooks` for its per-locale AsyncLocalStorage
// scope (off the embed; tree-shaken). It carries no time/random, so the other
// determinism rules don't apply.
import tsParser from '@typescript-eslint/parser';
import glissade from '@glissade/eslint-plugin';

export default [
  {
    files: ['packages/core/src/**/*.ts', 'packages/scene/src/**/*.ts'],
    ignores: [
      'packages/scene/src/layout.ts',
      'packages/scene/src/layoutCtors.ts',
      'packages/scene/src/layoutEngineYoga.ts',
      'packages/scene/src/layoutEngine.ts',
      'packages/scene/src/fontUsage.ts',
      'packages/core/src/fontIngest.ts',
      'packages/core/src/i18n.ts',
    ],
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
    plugins: { gas: glissade },
    rules: {
      'gas/no-wall-clock': 'error',
      'gas/no-unseeded-random': 'error',
      'gas/no-async-in-evaluate': 'error',
    },
  },
];
